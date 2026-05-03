"""`leaseos` CLI — week 1 surface area: `abstract` and `eval`."""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path

import click
from dotenv import load_dotenv
from rich.console import Console
from rich.table import Table

from .extract import extract, pick_model
from .pdf import load_pdf

load_dotenv(override=True)
console = Console()


@click.group()
def cli() -> None:
    """LeaseOS — UK commercial lease abstraction."""


@cli.command()
@click.argument("pdf_path", type=click.Path(exists=True, dir_okay=False, path_type=Path))
@click.option("--out", "out_dir", type=click.Path(path_type=Path), default=Path("output"),
              help="Directory to write the JSON output to.")
@click.option("--model", default=None, help="Override the model (default: claude-sonnet-4-6).")
@click.option("--dry-run", is_flag=True,
              help="Load the PDF and report what would be sent, but do not call the API.")
def abstract(pdf_path: Path, out_dir: Path, model: str | None, dry_run: bool) -> None:
    """Abstract a single lease PDF into a structured JSON record."""
    console.print(f"[bold]Loading[/bold] {pdf_path}")
    pdf = load_pdf(pdf_path)
    console.print(
        f"  → {pdf.page_count} pages, "
        f"{'scanned' if pdf.is_scanned else 'native PDF'}, "
        f"model: {pick_model(pdf, override=model)}"
    )

    if dry_run:
        console.print("[yellow]Dry run — not calling the API.[/yellow]")
        return

    if not os.getenv("ANTHROPIC_API_KEY"):
        console.print("[red]ANTHROPIC_API_KEY not set. Add it to .env or your shell.[/red]")
        sys.exit(1)

    with console.status("Extracting…", spinner="dots"):
        result = extract(pdf, model=model)

    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / f"{pdf_path.stem}.json"
    out_path.write_text(
        json.dumps(result.record.model_dump(mode="json"), indent=2, default=str)
    )

    _print_summary(result, out_path)


def _print_summary(result, out_path: Path) -> None:
    r = result.record
    table = Table(title=f"Abstracted: {r.source_document_filename}", show_lines=False)
    table.add_column("Field")
    table.add_column("Value")
    table.add_column("Cite")

    def row(label: str, field) -> None:
        if field is None:
            table.add_row(label, "—", "—")
            return
        val = getattr(field, "value", None)
        if val is None and hasattr(field, "name"):
            val = field.name
        cite = field.citation
        cite_str = f"p.{cite.page} {cite.clause_reference or ''}" if cite else "—"
        flag = " ⚠" if getattr(field, "confidence", None) and field.confidence.value == "low" else ""
        table.add_row(label + flag, str(val) if val is not None else "—", cite_str)

    row("Premises", r.premises_address)
    row("Landlord", r.landlord)
    row("Tenant", r.tenant)
    row("Term start", r.term_start)
    row("Term length (yrs)", r.term_length_years)
    row("Expiry", r.term_expiry)
    row("Initial rent (£)", r.initial_rent_gbp)
    row("Permitted use", r.permitted_use)
    row("Tenant break", r.tenant_break)
    row("Landlord break", r.landlord_break)

    console.print(table)
    console.print(
        f"\n[green]✓[/green] {result.model}  "
        f"{result.elapsed_seconds:.1f}s  "
        f"in={result.input_tokens}  out={result.output_tokens}  "
        f"cache_read={result.cache_read_tokens}  cache_write={result.cache_write_tokens}"
    )
    console.print(f"[green]✓[/green] Written: {out_path}")


@cli.command(name="eval")
@click.option("--corpus", type=click.Path(exists=True, file_okay=False, path_type=Path),
              default=Path("eval/ground_truth"))
@click.option("--leases", type=click.Path(exists=True, file_okay=False, path_type=Path),
              default=Path("leases"))
def eval_cmd(corpus: Path, leases: Path) -> None:
    """Run extraction across the eval corpus and score against ground truth."""
    from .eval_harness import run_eval

    run_eval(corpus_dir=corpus, leases_dir=leases, console=console)


if __name__ == "__main__":
    cli()
