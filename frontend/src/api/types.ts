// Hand-written types for endpoints whose response FastAPI exposes only as a
// generic dict/list in the OpenAPI schema (dict[str, object] returns don't
// generate a named schema), so openapi-typescript can't type them precisely.

export interface AppSettings {
  llm_base_url: string
  llm_model: string
  llm_api_key: string
  extract_chunk_lines: string
  classify_batch_size: string
  llm_timeout_s: string
  locale: string
  currency: string
  [key: string]: string
}

export interface LlmTestResult {
  ok: boolean
  latency_ms?: number
  error?: string
}

export interface PeriodSummary {
  income: number
  expenses: number
  net: number
  savings_rate: number
}

export interface StatsSummary extends PeriodSummary {
  prev: PeriodSummary
}

export interface MonthlyRow {
  month: number
  income: number
  expenses: number
  net: number
}

export interface ByCategoryRow {
  category_id: number | null
  name: string
  color: string
  group: string | null
  kind: "income" | "expense" | "transfer" | null
  total: number
}

export interface GridRow {
  category_id: number
  name: string
  color: string
  group: string | null
  months: number[]
  total: number
}

export interface GroupSubtotal {
  group: string
  months: number[]
  total: number
}

export interface GridResponse {
  income_rows: GridRow[]
  expense_rows: GridRow[]
  group_subtotals: GroupSubtotal[]
  month_totals: number[]
  year_total: number
}

export interface TransactionRead {
  id: number
  account_id: number
  import_id: number | null
  date: string
  description_raw: string
  counterparty: string
  amount_cents: number
  currency: string
  category_id: number | null
  confidence: number | null
  classified_by: "rule" | "llm" | "user" | null
  llm_reason: string
  reviewed: boolean
  notes: string
}

export interface TransactionListResponse {
  items: TransactionRead[]
  total: number
  page: number
  page_size: number
}
