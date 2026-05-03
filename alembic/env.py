"""Alembic environment for LeaseOS.

Reads `DATABASE_URL` from the same Settings the API uses, so dev (SQLite)
and prod (Postgres on Render) both go through the same migration path.
Importing the models module forces every table to register on Base.metadata
so autogenerate sees them.
"""

from __future__ import annotations

from logging.config import fileConfig

from sqlalchemy import engine_from_config, pool

from alembic import context

# Pull settings + Base + models so autogenerate has the full picture.
from leaseos.api.config import get_settings
from leaseos.api.db import Base
from leaseos.api import models  # noqa: F401  -- registers all tables

config = context.config

# Override the .ini's sqlalchemy.url with the runtime DATABASE_URL.
config.set_main_option("sqlalchemy.url", get_settings().database_url)

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def _common_kwargs() -> dict:
    """Options applied to both online and offline modes."""
    return {
        "target_metadata": target_metadata,
        # SQLite needs `render_as_batch` so ALTER TABLE-style migrations
        # actually work (SQLite has very limited ALTER support; batch mode
        # falls back to copy-and-rename).
        "render_as_batch": get_settings().database_url.startswith("sqlite"),
        # Detect column type changes — useful when switching SQLite ↔ Postgres
        "compare_type": True,
        # Detect server_default changes
        "compare_server_default": True,
    }


def run_migrations_offline() -> None:
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        **_common_kwargs(),
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    with connectable.connect() as connection:
        context.configure(connection=connection, **_common_kwargs())
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
