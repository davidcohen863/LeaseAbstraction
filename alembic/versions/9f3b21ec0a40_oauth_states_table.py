"""oauth_states table for DB-backed OAuth CSRF state.

Replaces the in-memory `_STATES` dict in routes/integrations.py which:
  * lost all in-flight OAuth handshakes on every Render restart, and
  * didn't share state across multiple uvicorn workers.

The table is intentionally tiny — rows live <15 minutes between
issue and consume — so no indexes beyond the PK.

Revision ID: 9f3b21ec0a40
Revises: 640471149aad
Create Date: 2026-05-03
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "9f3b21ec0a40"
down_revision: Union[str, None] = "640471149aad"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Idempotent: dev DBs may already have the table from `Base.metadata.create_all`
    # in `init_db()`. Skip cleanly in that case.
    bind = op.get_bind()
    insp = sa.inspect(bind)
    if "oauth_states" in insp.get_table_names():
        return

    op.create_table(
        "oauth_states",
        sa.Column("state", sa.String(length=64), primary_key=True),
        sa.Column("user_id", sa.String(length=64), nullable=False),
        sa.Column("provider", sa.String(length=32), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )
    op.create_index("ix_oauth_states_user_id", "oauth_states", ["user_id"])


def downgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    if "oauth_states" not in insp.get_table_names():
        return
    op.drop_index("ix_oauth_states_user_id", table_name="oauth_states")
    op.drop_table("oauth_states")
