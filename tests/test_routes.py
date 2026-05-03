"""Smoke tests for FastAPI route shape via TestClient.

Verifies:
- /health responds 200 with the expected payload
- Empty list endpoints return [] (not 500)
- 404s on unknown IDs are clean
- POST validation rejects bad input

Does NOT exercise extraction or pack generation (those need the LLM).
"""

from __future__ import annotations

import pytest


# ---- meta ---------------------------------------------------------------


def test_health(test_client):
    r = test_client.get("/health")
    assert r.status_code == 200
    body = r.json()
    assert body["ok"] is True
    assert body["service"] == "leaseos-api"


# ---- list endpoints return empty arrays on a fresh DB -------------------


@pytest.mark.parametrize("path", ["/leases", "/properties", "/comparables", "/packs", "/events"])
def test_list_endpoint_empty(test_client, path):
    r = test_client.get(path)
    assert r.status_code == 200, r.text
    body = r.json()
    assert isinstance(body, list)
    assert body == []


# ---- 404s on unknown IDs are well-formed --------------------------------


def test_unknown_lease_returns_404(test_client):
    r = test_client.get("/leases/00000000-0000-0000-0000-000000000000")
    assert r.status_code == 404
    assert r.json()["detail"] == "Lease not found"


def test_unknown_property_returns_404(test_client):
    r = test_client.get("/properties/00000000-0000-0000-0000-000000000000")
    assert r.status_code == 404


def test_unknown_pack_returns_404(test_client):
    r = test_client.get("/packs/00000000-0000-0000-0000-000000000000")
    assert r.status_code == 404


# ---- comparables CRUD ---------------------------------------------------


def test_create_and_list_comparable(test_client):
    body = {
        "address": "1 Test Parade, London N1 1AA",
        "rent_pa_gbp": 50000,
        "area_sqft": 1000,
        "use_class": "E",
        "deal_type": "letting",
        "source": "manual",
    }
    r = test_client.post("/comparables", json=body)
    assert r.status_code == 201, r.text
    created = r.json()
    assert created["address"] == body["address"]
    assert created["rent_pa_gbp"] == 50000

    listed = test_client.get("/comparables").json()
    assert len(listed) == 1
    assert listed[0]["id"] == created["id"]


def test_create_comparable_validation_rejects_missing_required(test_client):
    # Missing rent_pa_gbp
    r = test_client.post("/comparables", json={"address": "x"})
    assert r.status_code == 422


def test_bulk_create_comparables(test_client):
    payload = {
        "items": [
            {"address": "A", "rent_pa_gbp": 1000},
            {"address": "B", "rent_pa_gbp": 2000},
        ]
    }
    r = test_client.post("/comparables/bulk", json=payload)
    assert r.status_code == 201
    assert len(r.json()) == 2


def test_delete_comparable(test_client):
    created = test_client.post(
        "/comparables", json={"address": "X", "rent_pa_gbp": 100}
    ).json()
    r = test_client.delete(f"/comparables/{created['id']}")
    assert r.status_code == 204
    assert test_client.get("/comparables").json() == []


def test_delete_unknown_comparable_404(test_client):
    r = test_client.delete("/comparables/00000000-0000-0000-0000-000000000000")
    assert r.status_code == 404


# ---- auto-trigger packs (dry-run) ---------------------------------------


def test_auto_trigger_packs_dry_run_with_no_events(test_client):
    r = test_client.post("/packs/auto-trigger?days_ahead=180&dry_run=true")
    assert r.status_code == 202, r.text
    body = r.json()
    assert body["triggered"] == 0
    assert body["candidates_seen"] == 0


def test_auto_trigger_packs_validates_days_ahead(test_client):
    r = test_client.post("/packs/auto-trigger?days_ahead=999")
    assert r.status_code == 422


# ---- event acknowledgement on unknown id --------------------------------


def test_acknowledge_unknown_event_404(test_client):
    r = test_client.post("/events/00000000-0000-0000-0000-000000000000/acknowledge")
    assert r.status_code == 404
