"""SQLAlchemy ORM models for LeaseOS.

Designed to mirror the data model in the PRD §8. Uses JSON columns for the
extracted-record blob and citations so we don't have to migrate the schema
every time we add a clause to the Pydantic LeaseRecord.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from enum import Enum

from sqlalchemy import (
    JSON,
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base


def _uuid() -> str:
    return str(uuid.uuid4())


class LeaseStatus(str, Enum):
    UPLOADED = "uploaded"
    EXTRACTING = "extracting"
    READY_FOR_REVIEW = "ready_for_review"
    APPROVED = "approved"
    FAILED = "failed"


class EventType(str, Enum):
    RENT_REVIEW_TRIGGER = "rent_review_trigger"
    RENT_REVIEW_EFFECTIVE = "rent_review_effective"
    BREAK_NOTICE_DEADLINE = "break_notice_deadline"
    BREAK_DATE = "break_date"
    LEASE_EXPIRY = "lease_expiry"
    DEPOSIT_RETURN = "deposit_return"
    INSURANCE_RENEWAL = "insurance_renewal"


class EventStatus(str, Enum):
    UPCOMING = "upcoming"
    ACKNOWLEDGED = "acknowledged"
    DONE = "done"
    DISMISSED = "dismissed"


# ---- core entities -------------------------------------------------------


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)  # Clerk user ID
    email: Mapped[str] = mapped_column(String(320), index=True)
    display_name: Mapped[str | None] = mapped_column(String(255))
    role: Mapped[str] = mapped_column(String(32), default="user")  # 'user' | 'admin'
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())


class Property(Base):
    __tablename__ = "properties"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    address: Mapped[str] = mapped_column(Text)
    sector: Mapped[str | None] = mapped_column(String(64))
    landlord_client: Mapped[str | None] = mapped_column(String(255), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    leases: Mapped[list["Lease"]] = relationship(back_populates="property")


class Lease(Base):
    __tablename__ = "leases"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    property_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("properties.id"), index=True
    )
    label: Mapped[str] = mapped_column(String(255))  # human-readable, e.g. "14 Crouch End Broadway"
    status: Mapped[str] = mapped_column(String(32), default=LeaseStatus.UPLOADED.value, index=True)
    record_json: Mapped[dict | None] = mapped_column(JSON)  # full LeaseRecord dict
    extraction_model: Mapped[str | None] = mapped_column(String(64))
    extraction_seconds: Mapped[float | None] = mapped_column(Float)
    extraction_error: Mapped[str | None] = mapped_column(Text)
    assigned_user_id: Mapped[str | None] = mapped_column(String(64), ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), index=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now()
    )
    approved_at: Mapped[datetime | None] = mapped_column(DateTime)
    approved_by: Mapped[str | None] = mapped_column(String(64))

    property: Mapped[Property | None] = relationship(back_populates="leases")
    documents: Mapped[list["Document"]] = relationship(
        back_populates="lease", cascade="all, delete-orphan"
    )
    events: Mapped[list["LeaseEvent"]] = relationship(
        back_populates="lease", cascade="all, delete-orphan"
    )
    edits: Mapped[list["FieldEdit"]] = relationship(
        back_populates="lease", cascade="all, delete-orphan"
    )


class Document(Base):
    __tablename__ = "documents"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    lease_id: Mapped[str] = mapped_column(String(36), ForeignKey("leases.id"), index=True)
    filename: Mapped[str] = mapped_column(String(512))
    storage_path: Mapped[str] = mapped_column(String(1024))
    role: Mapped[str] = mapped_column(String(32), default="lease")  # 'lease' | 'side_letter' | 'variation'
    pages: Mapped[int | None] = mapped_column(Integer)
    sha256: Mapped[str | None] = mapped_column(String(64))
    size_bytes: Mapped[int | None] = mapped_column(Integer)
    uploaded_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    lease: Mapped[Lease] = relationship(back_populates="documents")


class FieldEdit(Base):
    """Audit log: every paralegal/surveyor edit to an extracted field."""

    __tablename__ = "field_edits"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    lease_id: Mapped[str] = mapped_column(String(36), ForeignKey("leases.id"), index=True)
    field_path: Mapped[str] = mapped_column(String(255))  # dotted path, e.g. "rent_review.basis"
    before_value: Mapped[dict | None] = mapped_column(JSON)
    after_value: Mapped[dict | None] = mapped_column(JSON)
    actor_user_id: Mapped[str | None] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    lease: Mapped[Lease] = relationship(back_populates="edits")


class LeaseEvent(Base):
    __tablename__ = "lease_events"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    lease_id: Mapped[str] = mapped_column(String(36), ForeignKey("leases.id"), index=True)
    event_type: Mapped[str] = mapped_column(String(64), index=True)
    event_date: Mapped[datetime] = mapped_column(DateTime, index=True)
    title: Mapped[str] = mapped_column(String(255))
    description: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(32), default=EventStatus.UPCOMING.value)
    assigned_user_id: Mapped[str | None] = mapped_column(String(64))
    pushed_to_google: Mapped[bool] = mapped_column(Boolean, default=False)
    pushed_to_outlook: Mapped[bool] = mapped_column(Boolean, default=False)
    google_event_id: Mapped[str | None] = mapped_column(String(255))
    outlook_event_id: Mapped[str | None] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    lease: Mapped[Lease] = relationship(back_populates="events")


class OAuthToken(Base):
    """Per-user OAuth credentials for Google / Microsoft."""

    __tablename__ = "oauth_tokens"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    user_id: Mapped[str] = mapped_column(String(64), ForeignKey("users.id"), index=True)
    provider: Mapped[str] = mapped_column(String(32))  # 'google' | 'microsoft'
    access_token: Mapped[str] = mapped_column(Text)
    refresh_token: Mapped[str | None] = mapped_column(Text)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime)
    scope: Mapped[str | None] = mapped_column(Text)
    account_email: Mapped[str | None] = mapped_column(String(320))
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now()
    )


class SlackIntegration(Base):
    __tablename__ = "slack_integrations"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    user_id: Mapped[str | None] = mapped_column(String(64), ForeignKey("users.id"), index=True)
    webhook_url: Mapped[str] = mapped_column(Text)
    channel_label: Mapped[str | None] = mapped_column(String(255))
    digest_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
