"""One-shot SQLite migration to add the AI-summary columns to the documents
table (added in v0.9 for side-letter support).

Run:  .venv/bin/python scripts/migrate_documents.py
"""

from __future__ import annotations

from sqlalchemy import inspect, text

from leaseos.api.db import engine, init_db


def main() -> None:
    init_db()
    insp = inspect(engine)
    cols = {c["name"] for c in insp.get_columns("documents")}
    added: list[str] = []
    with engine.begin() as conn:
        if "summary_markdown" not in cols:
            conn.execute(text("ALTER TABLE documents ADD COLUMN summary_markdown TEXT"))
            added.append("summary_markdown")
        if "summary_seconds" not in cols:
            conn.execute(text("ALTER TABLE documents ADD COLUMN summary_seconds REAL"))
            added.append("summary_seconds")
        if "summary_status" not in cols:
            conn.execute(text(
                "ALTER TABLE documents ADD COLUMN summary_status VARCHAR(32) DEFAULT 'skipped'"
            ))
            added.append("summary_status")
        if "summary_error" not in cols:
            conn.execute(text("ALTER TABLE documents ADD COLUMN summary_error TEXT"))
            added.append("summary_error")
    if added:
        print(f"Added columns to documents: {', '.join(added)}")
    else:
        print("documents already up to date.")


if __name__ == "__main__":
    main()
