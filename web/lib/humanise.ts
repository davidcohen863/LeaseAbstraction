/**
 * Convert raw enum values from the LeaseRecord schema into human-readable
 * labels for the UI. Used by FieldsPanel and anywhere else that displays
 * extracted values.
 *
 * Pattern: `humanise("rent_review_basis", "open_market")` → "Open market".
 * Falls back to the raw value (with underscores → spaces, title-cased) if
 * the key/value isn't mapped — so it never blows up on new schema additions.
 */

export const ENUM_LABELS: Record<string, Record<string, string>> = {
  // Repair basis
  basis: {
    fri: "Full Repairing & Insuring",
    iri: "Internal Repairing & Insuring",
    schedule_of_condition: "Schedule of Condition (limited)",
    other: "Other",
    unknown: "Unknown",
  },

  // Rent review basis (RentReview.basis)
  rent_review_basis: {
    open_market: "Open market",
    rpi: "RPI-linked",
    cpi: "CPI-linked",
    fixed: "Fixed uplift",
    hybrid: "Hybrid",
    unknown: "Unknown",
  },

  // Rent payment frequency
  rent_frequency: {
    quarterly: "Quarterly",
    monthly: "Monthly",
    annually: "Annually",
    other: "Other",
    unknown: "Unknown",
  },

  // Break clause party
  party: {
    tenant: "Tenant",
    landlord: "Landlord",
    mutual: "Mutual",
  },

  // Comparable deal type
  deal_type: {
    letting: "New letting",
    rent_review: "Settled rent review",
    sale: "Sale",
  },

  // Comparable source
  source: {
    rightmove: "Rightmove",
    egi: "EGi",
    internal: "Internal (settled)",
    manual: "Manual",
  },

  // Lease lifecycle status
  lease_status: {
    uploaded: "Uploaded",
    extracting: "Extracting…",
    ready_for_review: "Ready for review",
    approved: "Approved",
    failed: "Failed",
  },

  // Pack lifecycle status
  pack_status: {
    generating: "Generating…",
    draft: "Draft",
    sent: "Sent",
    settled: "Settled",
    failed: "Failed",
  },
};

/** Boolean-as-string display ("yes" / "no" with subtle indicator). */
export function humaniseBool(v: boolean | null | undefined): string {
  if (v == null) return "—";
  return v ? "Yes ✓" : "No ✗";
}

/** Look up a value in a known enum group, with a clean fallback. */
export function humanise(group: string, value: unknown): string {
  if (value == null || value === "") return "—";
  if (typeof value === "boolean") return humaniseBool(value);
  const str = String(value);
  const groupMap = ENUM_LABELS[group];
  if (groupMap && groupMap[str]) return groupMap[str];
  // Fallback: clean up snake_case / lowercase
  return str
    .replace(/_/g, " ")
    .replace(/\b([a-z])/g, (m) => m.toUpperCase());
}

/**
 * Humanise a key=value pair the way it should appear in a composite-field
 * row. Picks the right enum group from the *path* of the field.
 *
 * `composite_path` is the parent (e.g. "rent_review", "repair", "alienation").
 */
export function humaniseCompositeValue(
  composite_path: string,
  key: string,
  value: unknown
): string {
  if (value == null || value === "" || (Array.isArray(value) && value.length === 0)) {
    return "—";
  }

  // Booleans across all composites
  if (typeof value === "boolean") return humaniseBool(value);

  // Specific lookups by (composite, key)
  if (composite_path === "rent_review" && key === "basis") {
    return humanise("rent_review_basis", value);
  }
  if (composite_path === "repair" && key === "basis") {
    return humanise("basis", value);
  }
  if (composite_path === "tenant_break" || composite_path === "landlord_break") {
    if (key === "party") return humanise("party", value);
  }

  // % values — coerce numbers
  if (key.endsWith("_pct") && typeof value === "number") {
    return `${value}%`;
  }

  // GBP values — basic coercion
  if (key.endsWith("_gbp") && typeof value === "number") {
    return `£${value.toLocaleString()}`;
  }

  // Arrays of dates etc.
  if (Array.isArray(value)) {
    return value.map((v) => String(v)).join(", ");
  }

  // Nested object — flatten one level
  if (typeof value === "object" && value !== null) {
    return Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v != null && v !== "")
      .map(([k, v]) => `${humaniseKey(k)} = ${v}`)
      .join(", ");
  }

  return String(value);
}

/** Humanise a snake_case key into a Sentence Case label. */
export function humaniseKey(key: string): string {
  return key
    .replace(/_/g, " ")
    .replace(/\bpct\b/g, "%")
    .replace(/\bgbp\b/g, "£")
    .replace(/\baga\b/i, "AGA")
    .replace(/\brpi\b/i, "RPI")
    .replace(/\bcpi\b/i, "CPI")
    .replace(/\bepc\b/i, "EPC")
    .replace(/\bfri\b/i, "FRI")
    .replace(/\biri\b/i, "IRI")
    .replace(/^([a-z])/, (m) => m.toUpperCase());
}
