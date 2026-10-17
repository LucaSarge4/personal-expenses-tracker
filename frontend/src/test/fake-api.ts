// A tiny in-memory backend for component tests. Routes are keyed as
// "METHOD /api/path", where path segments like `{id}` match any value.
// Every request is recorded in `apiCalls` so tests can assert on what the UI sent.
import { vi } from "vitest"

export type ApiCall = {
  method: string
  path: string
  query: Record<string, string>
  body: unknown
  params: Record<string, string>
}

type Resolver = unknown | ((call: ApiCall) => unknown)

/** Return this from a route to respond with a non-2xx status. */
export class FakeResponse {
  status: number
  body: unknown
  constructor(status: number, body: unknown) {
    this.status = status
    this.body = body
  }
}

export const DEFAULT_SETTINGS = {
  llm_base_url: "http://localhost:11434/v1",
  llm_model: "test-model",
  llm_api_key: "",
  extract_chunk_lines: "80",
  classify_batch_size: "25",
  llm_timeout_s: "120",
  locale: "en",
  currency: "EUR",
}

const DEFAULT_ROUTES: Record<string, Resolver> = {
  "GET /api/settings": DEFAULT_SETTINGS,
  "GET /api/accounts": [],
  "GET /api/categories": [],
  "GET /api/rules": [],
  "GET /api/imports": [],
  "GET /api/llm/models": [],
  "GET /api/transactions": { items: [], total: 0, page: 1, page_size: 50 },
  "GET /api/stats/summary": {
    income: 0,
    expenses: 0,
    net: 0,
    savings_rate: 0,
    prev: { income: 0, expenses: 0, net: 0, savings_rate: 0 },
  },
  "GET /api/stats/monthly": [],
  "GET /api/stats/by-category": [],
  "GET /api/stats/grid": {
    income_rows: [],
    expense_rows: [],
    group_subtotals: [],
    month_totals: Array(12).fill(0),
    year_total: 0,
  },
}

let routes: Record<string, Resolver> = {}
export let apiCalls: ApiCall[] = []

export function resetFakeApi() {
  routes = { ...DEFAULT_ROUTES }
  apiCalls = []
  vi.stubGlobal("fetch", vi.fn(handle))
}

/** Adds or overrides routes for the current test. */
export function mockApi(overrides: Record<string, Resolver>) {
  Object.assign(routes, overrides)
}

/** Calls matching `METHOD /path` (path params as `{x}` or concrete values). */
export function callsTo(key: string): ApiCall[] {
  const [method, pattern] = key.split(" ")
  return apiCalls.filter((c) => c.method === method && matchPath(pattern, c.path) !== null)
}

function matchPath(pattern: string, path: string): Record<string, string> | null {
  const a = pattern.split("/")
  const b = path.split("/")
  if (a.length !== b.length) return null
  const params: Record<string, string> = {}
  for (let i = 0; i < a.length; i++) {
    const m = /^\{(\w+)\}$/.exec(a[i])
    if (m) params[m[1]] = b[i]
    else if (a[i] !== b[i]) return null
  }
  return params
}

async function readBody(input: RequestInfo | URL, init?: RequestInit): Promise<unknown> {
  const raw = input instanceof Request ? await input.clone().text() : init?.body
  if (raw instanceof FormData) return raw
  if (typeof raw !== "string" || raw === "") return undefined
  try {
    return JSON.parse(raw)
  } catch {
    return raw
  }
}

async function handle(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = new URL(input instanceof Request ? input.url : String(input), "http://localhost")
  const method = (input instanceof Request ? input.method : init?.method ?? "GET").toUpperCase()
  const call: ApiCall = {
    method,
    path: url.pathname,
    query: Object.fromEntries(url.searchParams),
    body: await readBody(input, init),
    params: {},
  }
  apiCalls.push(call)

  // Exact keys win over parameterized ones.
  let resolver: Resolver | undefined = routes[`${method} ${url.pathname}`]
  if (resolver === undefined) {
    for (const [key, value] of Object.entries(routes)) {
      const [m, pattern] = key.split(" ")
      if (m !== method) continue
      const params = matchPath(pattern, url.pathname)
      if (params) {
        call.params = params
        resolver = value
        break
      }
    }
  }
  if (resolver === undefined) {
    return json(404, { detail: `No fake route for ${method} ${url.pathname}` })
  }
  const result = typeof resolver === "function" ? await resolver(call) : resolver
  if (result instanceof FakeResponse) return json(result.status, result.body)
  return json(200, result ?? null)
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}
