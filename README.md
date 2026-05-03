# LeaseOS — v1 Pilot (Week 1: Extraction CLI)

Abstracts UK commercial leases into a structured record with per-field source citations.

## Setup

```bash
cd leaseos
python3.11 -m venv .venv
source .venv/bin/activate
pip install -e .
cp .env.example .env   # then add your ANTHROPIC_API_KEY
```

## Usage

```bash
# Abstract a single lease, write JSON to ./output/
leaseos abstract path/to/lease.pdf

# Inspect what will be sent without calling the API
leaseos abstract path/to/lease.pdf --dry-run

# Run the eval harness against ./eval/ground_truth/
leaseos eval
```

Output JSON contains the 15 priority clauses plus, for every field:
- `value` — typed value (string, date, money, enum)
- `citation.page` — 1-indexed PDF page
- `citation.clause_reference` — e.g. `cl. 5.1`, `Sched 4`
- `citation.quote` — verbatim quote from the lease
- `confidence` — `high` | `low` (set by two-pass disagreement check; v1 uses single-pass placeholder)

## Project layout

```
src/leaseos/
  schema.py     # Pydantic models for the lease record + 15 priority fields
  pdf.py        # PDF loading: native text + page rasterisation
  prompts.py    # System prompt for extraction
  extract.py    # Anthropic API call (vision + tool use + prompt caching)
  cli.py        # `leaseos abstract` and `leaseos eval`
eval/
  harness.py        # Score extraction against ground-truth YAMLs
  ground_truth/     # One YAML per lease with expected values
leases/             # Real lease PDFs (gitignored)
output/             # JSON extraction outputs (gitignored)
```

## Week 1 success criterion

`leaseos abstract sample.pdf` returns a valid JSON record with citations on every field, in <5 minutes, for any of the first 10 leases supplied by Claridges.
