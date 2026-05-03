"""Tests for the destructive endpoints we just added:
DELETE /leases/{id}, DELETE /packs/{id}, DELETE /properties/{id},
PATCH /leases/{id} (rename).

The cascade behaviour matters as much as the happy-path: we need to assert
that orphan rows are NOT left in the DB (events, packs, pack_documents,
field_edits) and that disk files are NOT left behind.
"""

from __future__ import annotations

from datetime import datetime, timedelta
from pathlib import Path

import pytest

from leaseos.api.models import (
    Comparable,
    ComparableSource,
    DealType,
    FieldEdit,
    Lease,
    LeaseEvent,
    LeaseStatus,
    PackDocument,
    PackStatus,
    Property,
    RentReviewPack,
)
from leaseos.utils import utc_now


def _seed_lease(db, *, label="Olive & Vine", status=LeaseStatus.APPROVED.value):
    lease = Lease(label=label, status=status)
    db.add(lease)
    db.flush()
    return lease


def _seed_pack(db, *, lease, status=PackStatus.DRAFT.value, settled_rent=None):
    pack = RentReviewPack(
        lease_id=lease.id,
        status=status,
        settled_rent_gbp=settled_rent,
    )
    db.add(pack)
    db.flush()
    db.add(PackDocument(
        pack_id=pack.id,
        kind="landlord_memo",
        filename="landlord_memo.docx",
        storage_path="data/packs/x/landlord_memo.docx",
        markdown_content="# Memo",
    ))
    db.flush()
    return pack


# ---- DELETE /leases/{id} -----------------------------------------------


class TestDeleteLease:
    def test_404_if_missing(self, test_client):
        r = test_client.delete("/leases/does-not-exist")
        assert r.status_code == 404

    def test_cascades_documents_events_packs_edits(self, test_client, db_session):
        # Use the test_client's DB session (not db_session; they're separate engines)
        # by going through the route. Seed via the route where possible.
        from leaseos.api.db import SessionLocal as _SL  # not used, kept for future
        # Easier: hit the actual fixtures directly via the test_client's overridden session.
        # We'll use the GET endpoints to confirm cascade.
        # Step 1: upload nothing — instead, build via direct DB write through the
        # test_client by patching the engine. Alternative: use the upload endpoint
        # which is heavy. Simplest: seed via TestClient's session-override.
        from leaseos.api import db as db_module

        # Drop into the override session to seed
        gen = next(iter(test_client.app.dependency_overrides[db_module.get_db]()))  # type: ignore[index]
        try:
            lease = _seed_lease(gen)
            event = LeaseEvent(
                lease_id=lease.id,
                event_type="rent_review_trigger",
                event_date=utc_now() + timedelta(days=180),
                title="Review prep",
            )
            gen.add(event)
            edit = FieldEdit(
                lease_id=lease.id,
                field_path="initial_rent_gbp.value",
                before_value={"v": 42500},
                after_value={"v": 43000},
            )
            gen.add(edit)
            pack = _seed_pack(gen, lease=lease, status=PackStatus.DRAFT.value)
            gen.commit()
            lease_id = lease.id
            event_id = event.id
            pack_id = pack.id
        finally:
            gen.close()

        # Sanity: GETs work pre-delete
        assert test_client.get(f"/leases/{lease_id}").status_code == 200
        assert test_client.get(f"/packs/{pack_id}").status_code == 200

        # Delete
        r = test_client.delete(f"/leases/{lease_id}")
        assert r.status_code == 204, r.text

        # All gone
        assert test_client.get(f"/leases/{lease_id}").status_code == 404
        assert test_client.get(f"/packs/{pack_id}").status_code == 404

        # And no orphan rows in any related table
        gen = next(iter(test_client.app.dependency_overrides[db_module.get_db]()))  # type: ignore[index]
        try:
            assert gen.query(LeaseEvent).filter_by(id=event_id).count() == 0
            assert gen.query(RentReviewPack).filter_by(id=pack_id).count() == 0
            assert gen.query(PackDocument).filter_by(pack_id=pack_id).count() == 0
            assert gen.query(FieldEdit).filter_by(lease_id=lease_id).count() == 0
        finally:
            gen.close()

    def test_property_survives_lease_delete(self, test_client):
        """The Property the lease belonged to is intentionally NOT cascaded —
        a Property may have other leases, and even if this was the last one,
        dropping it would lose the user-edited landlord_client / sector / notes."""
        from leaseos.api import db as db_module

        gen = next(iter(test_client.app.dependency_overrides[db_module.get_db]()))  # type: ignore[index]
        try:
            prop = Property(
                address="14 Crouch End Broadway, London N8 8DT",
                address_normalised="14 crouch end broadway london n8 8dt",
                landlord_client="Mr Patel",
                notes="High-value tenant covenant",
            )
            gen.add(prop)
            gen.flush()
            lease = _seed_lease(gen)
            lease.property_id = prop.id
            gen.commit()
            lease_id = lease.id
            prop_id = prop.id
        finally:
            gen.close()

        r = test_client.delete(f"/leases/{lease_id}")
        assert r.status_code == 204

        # Property still there with metadata intact
        r = test_client.get(f"/properties/{prop_id}")
        assert r.status_code == 200
        body = r.json()
        assert body["landlord_client"] == "Mr Patel"
        assert body["notes"] == "High-value tenant covenant"
        assert body["lease_count"] == 0

    def test_comparables_orphan_lease_id_nullified(self, test_client):
        """An internal Comparable derived from a settled review references
        the lease via derived_from_lease_id. Deleting the lease must NOT
        delete the comparable (the rent evidence is still valid) — instead
        the FK is null'd."""
        from leaseos.api import db as db_module

        gen = next(iter(test_client.app.dependency_overrides[db_module.get_db]()))  # type: ignore[index]
        try:
            lease = _seed_lease(gen)
            comp = Comparable(
                address=lease.label,
                rent_pa_gbp=53500,
                use_class="E(b)",
                deal_date=utc_now(),
                deal_type=DealType.RENT_REVIEW.value,
                source=ComparableSource.INTERNAL.value,
                notes=f"Settled rent review on {lease.label}",
                derived_from_lease_id=lease.id,
            )
            gen.add(comp)
            gen.commit()
            lease_id = lease.id
            comp_id = comp.id
        finally:
            gen.close()

        assert test_client.delete(f"/leases/{lease_id}").status_code == 204

        gen = next(iter(test_client.app.dependency_overrides[db_module.get_db]()))  # type: ignore[index]
        try:
            survivor = gen.query(Comparable).filter_by(id=comp_id).one()
            assert survivor.derived_from_lease_id is None
            assert survivor.rent_pa_gbp == 53500
        finally:
            gen.close()


# ---- DELETE /packs/{id} -----------------------------------------------


class TestDeletePack:
    def test_404_if_missing(self, test_client):
        r = test_client.delete("/packs/does-not-exist")
        assert r.status_code == 404

    def test_draft_pack_deletes_with_documents(self, test_client):
        from leaseos.api import db as db_module

        gen = next(iter(test_client.app.dependency_overrides[db_module.get_db]()))  # type: ignore[index]
        try:
            lease = _seed_lease(gen)
            pack = _seed_pack(gen, lease=lease, status=PackStatus.DRAFT.value)
            gen.commit()
            pack_id = pack.id
        finally:
            gen.close()

        r = test_client.delete(f"/packs/{pack_id}")
        assert r.status_code == 204

        assert test_client.get(f"/packs/{pack_id}").status_code == 404

        gen = next(iter(test_client.app.dependency_overrides[db_module.get_db]()))  # type: ignore[index]
        try:
            assert gen.query(PackDocument).filter_by(pack_id=pack_id).count() == 0
        finally:
            gen.close()

    def test_settled_pack_refuses_delete(self, test_client):
        """Settled packs have fed into comparables and the audit trail —
        deleting them would lose provenance. Refuse with 400."""
        from leaseos.api import db as db_module

        gen = next(iter(test_client.app.dependency_overrides[db_module.get_db]()))  # type: ignore[index]
        try:
            lease = _seed_lease(gen)
            pack = _seed_pack(gen, lease=lease, status=PackStatus.SETTLED.value, settled_rent=53500)
            gen.commit()
            pack_id = pack.id
        finally:
            gen.close()

        r = test_client.delete(f"/packs/{pack_id}")
        assert r.status_code == 400
        assert "settled" in r.text.lower()
        # Pack still alive
        assert test_client.get(f"/packs/{pack_id}").status_code == 200


# ---- DELETE /properties/{id} ------------------------------------------


class TestDeleteProperty:
    def test_404_if_missing(self, test_client):
        r = test_client.delete("/properties/does-not-exist")
        assert r.status_code == 404

    def test_refuses_if_leases_attached(self, test_client):
        from leaseos.api import db as db_module

        gen = next(iter(test_client.app.dependency_overrides[db_module.get_db]()))  # type: ignore[index]
        try:
            prop = Property(address="X", address_normalised="x")
            gen.add(prop)
            gen.flush()
            lease = _seed_lease(gen)
            lease.property_id = prop.id
            gen.commit()
            prop_id = prop.id
        finally:
            gen.close()

        r = test_client.delete(f"/properties/{prop_id}")
        assert r.status_code == 400
        assert "lease" in r.text.lower()
        # Property still alive
        assert test_client.get(f"/properties/{prop_id}").status_code == 200

    def test_force_unlinks_leases_and_deletes(self, test_client):
        from leaseos.api import db as db_module

        gen = next(iter(test_client.app.dependency_overrides[db_module.get_db]()))  # type: ignore[index]
        try:
            prop = Property(address="X", address_normalised="x")
            gen.add(prop)
            gen.flush()
            lease = _seed_lease(gen)
            lease.property_id = prop.id
            gen.commit()
            prop_id = prop.id
            lease_id = lease.id
        finally:
            gen.close()

        r = test_client.delete(f"/properties/{prop_id}?force=true")
        assert r.status_code == 204
        # Property gone
        assert test_client.get(f"/properties/{prop_id}").status_code == 404
        # Lease survives, with property_id null'd
        r = test_client.get(f"/leases/{lease_id}")
        assert r.status_code == 200
        assert r.json()["property_id"] is None

    def test_empty_property_deletes_without_force(self, test_client):
        from leaseos.api import db as db_module

        gen = next(iter(test_client.app.dependency_overrides[db_module.get_db]()))  # type: ignore[index]
        try:
            prop = Property(address="Empty", address_normalised="empty")
            gen.add(prop)
            gen.commit()
            prop_id = prop.id
        finally:
            gen.close()

        r = test_client.delete(f"/properties/{prop_id}")
        assert r.status_code == 204
        assert test_client.get(f"/properties/{prop_id}").status_code == 404


# ---- PATCH /leases/{id} (rename) --------------------------------------


class TestRenameLease:
    def test_rename_updates_label_and_logs_edit(self, test_client):
        from leaseos.api import db as db_module

        gen = next(iter(test_client.app.dependency_overrides[db_module.get_db]()))  # type: ignore[index]
        try:
            lease = _seed_lease(gen, label="old name")
            gen.commit()
            lease_id = lease.id
        finally:
            gen.close()

        r = test_client.patch(f"/leases/{lease_id}", json={"label": "new name"})
        assert r.status_code == 200
        assert r.json()["label"] == "new name"

        # Audit log captures it
        r2 = test_client.get(f"/leases/{lease_id}/audit")
        assert r2.status_code == 200
        entries = r2.json()
        rename = next(e for e in entries if e["field_path"] == "__label__")
        assert rename["before_value"] == "old name"
        assert rename["after_value"] == "new name"

    def test_rename_to_blank_rejected(self, test_client):
        from leaseos.api import db as db_module

        gen = next(iter(test_client.app.dependency_overrides[db_module.get_db]()))  # type: ignore[index]
        try:
            lease = _seed_lease(gen)
            gen.commit()
            lease_id = lease.id
        finally:
            gen.close()

        r = test_client.patch(f"/leases/{lease_id}", json={"label": "   "})
        assert r.status_code == 400

    def test_no_op_does_not_log_edit(self, test_client):
        from leaseos.api import db as db_module

        gen = next(iter(test_client.app.dependency_overrides[db_module.get_db]()))  # type: ignore[index]
        try:
            lease = _seed_lease(gen, label="same")
            gen.commit()
            lease_id = lease.id
        finally:
            gen.close()

        r = test_client.patch(f"/leases/{lease_id}", json={"label": "same"})
        assert r.status_code == 200
        r2 = test_client.get(f"/leases/{lease_id}/audit")
        assert not any(e["field_path"] == "__label__" for e in r2.json())
