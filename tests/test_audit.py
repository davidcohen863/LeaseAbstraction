"""Tests for the audit feed (firm-wide and per-lease)."""

from __future__ import annotations

from datetime import datetime, timedelta

from leaseos.api.models import FieldEdit, Lease, LeaseStatus
from leaseos.api.routes.audit import _build_feed, _summarise_value
from leaseos.utils import utc_now


def _seed_lease(db, *, label="Olive & Vine", status=LeaseStatus.READY_FOR_REVIEW.value, approved_at=None, approved_by=None):
    lease = Lease(label=label, status=status, approved_at=approved_at, approved_by=approved_by)
    db.add(lease)
    db.flush()
    return lease


def _add_edit(db, lease, *, path, before, after, actor=None, ago_minutes=0):
    fe = FieldEdit(
        lease_id=lease.id,
        field_path=path,
        before_value={"v": before},
        after_value={"v": after},
        actor_user_id=actor,
    )
    db.add(fe)
    db.flush()
    if ago_minutes:
        fe.created_at = utc_now() - timedelta(minutes=ago_minutes)
    return fe


class TestSummariseValue:
    def test_unwraps_v_dict(self):
        assert _summarise_value({"v": 42}) == 42
        assert _summarise_value({"v": "hi"}) == "hi"

    def test_passes_through_non_v(self):
        assert _summarise_value({"a": 1}) == {"a": 1}
        assert _summarise_value(None) is None
        assert _summarise_value("plain") == "plain"


class TestBuildFeed:
    def test_empty_db_returns_empty_list(self, db_session):
        assert _build_feed(db_session, lease_id=None, limit=10) == []

    def test_field_edits_appear_newest_first(self, db_session):
        lease = _seed_lease(db_session)
        _add_edit(db_session, lease, path="initial_rent_gbp.value", before=42500, after=43000, ago_minutes=10)
        _add_edit(db_session, lease, path="rent_review.basis", before="x", after="y", ago_minutes=5)
        _add_edit(db_session, lease, path="tenant.name", before="A", after="B", ago_minutes=1)
        db_session.commit()

        feed = _build_feed(db_session, lease_id=None, limit=10)
        assert len(feed) == 3
        # Newest first
        assert feed[0].field_path == "tenant.name"
        assert feed[2].field_path == "initial_rent_gbp.value"
        # before/after are unwrapped from {"v": ...}
        assert feed[0].before_value == "A"
        assert feed[0].after_value == "B"
        assert feed[0].lease_label == "Olive & Vine"

    def test_lease_approval_appears_in_feed(self, db_session):
        approved_at = utc_now() - timedelta(minutes=2)
        _seed_lease(
            db_session,
            label="14 Crouch End",
            status=LeaseStatus.APPROVED.value,
            approved_at=approved_at,
            approved_by="user_abc",
        )
        db_session.commit()

        feed = _build_feed(db_session, lease_id=None, limit=10)
        assert len(feed) == 1
        assert feed[0].kind == "lease_approved"
        assert feed[0].actor_user_id == "user_abc"
        assert feed[0].lease_label == "14 Crouch End"

    def test_lease_scoped_filter(self, db_session):
        a = _seed_lease(db_session, label="A")
        b = _seed_lease(db_session, label="B")
        _add_edit(db_session, a, path="initial_rent_gbp.value", before=1, after=2)
        _add_edit(db_session, b, path="initial_rent_gbp.value", before=3, after=4)
        db_session.commit()

        feed_a = _build_feed(db_session, lease_id=a.id, limit=10)
        assert {e.lease_label for e in feed_a} == {"A"}

    def test_limit_caps_returned_rows(self, db_session):
        lease = _seed_lease(db_session)
        for i in range(20):
            _add_edit(db_session, lease, path=f"f{i}", before=None, after=i, ago_minutes=i)
        db_session.commit()
        feed = _build_feed(db_session, lease_id=None, limit=5)
        assert len(feed) == 5

    def test_mixed_feed_sorted_by_created_at(self, db_session):
        # An old approval + a newer edit should interleave correctly.
        old_approval = utc_now() - timedelta(hours=2)
        a = _seed_lease(
            db_session, label="A",
            status=LeaseStatus.APPROVED.value, approved_at=old_approval, approved_by="u1",
        )
        _add_edit(db_session, a, path="recent_field", before=None, after="x", ago_minutes=1)
        db_session.commit()

        feed = _build_feed(db_session, lease_id=None, limit=10)
        assert len(feed) == 2
        assert feed[0].kind == "field_edit"  # newer
        assert feed[1].kind == "lease_approved"  # older
