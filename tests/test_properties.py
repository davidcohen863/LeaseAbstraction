"""Tests for normalise_address + _ensure_property."""

from __future__ import annotations

import pytest

from leaseos.api.models import Lease, LeaseStatus, Property, normalise_address
from leaseos.api.worker import _ensure_property


# ---- normalise_address --------------------------------------------------


class TestNormaliseAddress:
    def test_lowercases(self):
        assert normalise_address("14 CROUCH END BROADWAY") == "14 crouch end broadway"

    def test_collapses_whitespace(self):
        assert normalise_address("14   Crouch  End \n  Broadway") == "14 crouch end broadway"

    def test_strips_punctuation(self):
        assert normalise_address("14, Crouch End Broadway.") == "14 crouch end broadway"
        assert normalise_address("14: Crouch; End Broadway") == "14 crouch end broadway"

    def test_handles_empty_and_none(self):
        assert normalise_address("") == ""
        assert normalise_address(None) == ""

    def test_idempotent(self):
        a = normalise_address("14 Crouch End Broadway, London N8 8DT")
        assert normalise_address(a) == a

    def test_two_visually_similar_addresses_collapse_to_same_key(self):
        a = "14 CROUCH END BROADWAY, London N8 8DT"
        b = "  14 crouch  end  broadway,  london N8 8DT  "
        assert normalise_address(a) == normalise_address(b)


# ---- _ensure_property ---------------------------------------------------


class TestEnsureProperty:
    def test_creates_new_property_for_unseen_address(self, db_session):
        pid = _ensure_property(db_session, "55 Test Lane, London E1 1AA")
        assert pid is not None
        prop = db_session.get(Property, pid)
        assert prop is not None
        assert prop.address == "55 Test Lane, London E1 1AA"
        assert prop.address_normalised == "55 test lane london e1 1aa"

    def test_returns_existing_property_for_same_address(self, db_session):
        pid1 = _ensure_property(db_session, "55 Test Lane")
        pid2 = _ensure_property(db_session, "55 Test Lane")
        assert pid1 == pid2

    def test_dedupes_via_normalisation(self, db_session):
        pid1 = _ensure_property(db_session, "55 TEST  Lane,")
        pid2 = _ensure_property(db_session, "  55 test lane")
        assert pid1 == pid2
        # Only one Property row exists
        assert db_session.query(Property).count() == 1

    def test_does_not_overwrite_existing_property_metadata(self, db_session):
        # Create with sector + landlord set, then re-ensure the same address
        pid = _ensure_property(db_session, "55 Test Lane")
        prop = db_session.get(Property, pid)
        prop.sector = "Retail"
        prop.landlord_client = "Acme Property Co"
        db_session.commit()

        pid2 = _ensure_property(db_session, "55 Test Lane")
        prop_after = db_session.get(Property, pid2)
        assert prop_after.sector == "Retail"
        assert prop_after.landlord_client == "Acme Property Co"
