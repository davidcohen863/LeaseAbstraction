/**
 * Minimal CSV parser. Handles quoted cells (incl. embedded commas, doubled
 * quotes, and CRLF line endings). No external deps.
 *
 * Returns an array of row objects keyed by the (lowercased, trimmed) header
 * row. Use `parseCsv(text)` for the simple shape; `parseCsvRows(text)` if you
 * want raw rows with no header inference.
 */

export function parseCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  let i = 0;
  const n = text.length;

  while (i < n) {
    const c = text[i];

    if (inQuotes) {
      if (c === '"') {
        if (i + 1 < n && text[i + 1] === '"') {
          cell += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      cell += c;
      i++;
      continue;
    }

    if (c === '"') {
      inQuotes = true;
      i++;
      continue;
    }

    if (c === ",") {
      row.push(cell);
      cell = "";
      i++;
      continue;
    }

    if (c === "\r") {
      // Skip; CRLF handled by the \n branch
      i++;
      continue;
    }

    if (c === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      i++;
      continue;
    }

    cell += c;
    i++;
  }

  // Flush the trailing cell/row if the file didn't end with a newline
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }

  return rows.filter((r) => r.length > 0 && !(r.length === 1 && r[0] === ""));
}

export function parseCsv(text: string): Record<string, string>[] {
  const rows = parseCsvRows(text);
  if (rows.length < 2) return [];
  const header = rows[0].map((h) => h.trim().toLowerCase().replace(/\s+/g, "_"));
  return rows.slice(1).map((r) => {
    const obj: Record<string, string> = {};
    for (let i = 0; i < header.length; i++) {
      obj[header[i]] = (r[i] ?? "").trim();
    }
    return obj;
  });
}
