// Minimal valid API objects for tests; pass overrides for the fields a test cares about.
import type { components } from "@/api/schema"
import type { GridRow, TransactionRead } from "@/api/types"

type Schemas = components["schemas"]

export function makeAccount(overrides: Partial<Schemas["AccountRead"]> = {}): Schemas["AccountRead"] {
  return { id: 1, name: "Checking", bank: "Test Bank", currency: "EUR", notes: "", ...overrides }
}

export function makeCategory(overrides: Partial<Schemas["CategoryRead"]> = {}): Schemas["CategoryRead"] {
  return {
    id: 1,
    name: "Groceries",
    kind: "expense",
    group: null,
    color: "#34c759",
    llm_hint: "",
    exclude_from_totals: false,
    sort_order: 0,
    archived: false,
    ...overrides,
  }
}

export function makeImport(overrides: Partial<Schemas["ImportRead"]> = {}): Schemas["ImportRead"] {
  return {
    id: 1,
    account_id: 1,
    filename: "statement.csv",
    status: "review",
    progress: 100,
    model: "test-model",
    extracted_count: 3,
    inserted_count: 3,
    duplicate_count: 0,
    low_confidence_count: 0,
    reconcile_diff_cents: null,
    error: null,
    created_at: "2026-01-01T00:00:00",
    ...overrides,
  }
}

export function makeTransaction(overrides: Partial<TransactionRead> = {}): TransactionRead {
  return {
    id: 1,
    account_id: 1,
    import_id: 1,
    date: "2026-01-15",
    description_raw: "ESSELUNGA MILANO",
    counterparty: "esselunga milano",
    amount_cents: -2550,
    currency: "EUR",
    category_id: null,
    confidence: 0.9,
    classified_by: "llm",
    llm_reason: "",
    reviewed: false,
    notes: "",
    ...overrides,
  }
}

export function makeGridRow(overrides: Partial<GridRow> = {}): GridRow {
  return {
    category_id: 1,
    name: "Groceries",
    color: "#34c759",
    group: null,
    months: Array(12).fill(0),
    total: 0,
    ...overrides,
  }
}

/** A 12-month array with the given values at 1-based month positions. */
export function months(values: Record<number, number>): number[] {
  return Array.from({ length: 12 }, (_, i) => values[i + 1] ?? 0)
}
