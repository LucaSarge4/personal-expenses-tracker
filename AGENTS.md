# AGENTS.md

Guidance for agents (and humans) working in this repo. This is the single
source of truth; `CLAUDE.md` just points here.

## Commands

- Install everything: `make install`
- Run in dev mode: `make dev` (backend on :8000, frontend on :5173)
- Run everything from one port: `make start`
- Lint: `make lint`
- Format: `make format`
- All tests: `make test`
- Single backend test: `cd backend && uv run pytest tests/test_stats.py::test_grid_rows_groups_and_totals -q`
- Single frontend test: `cd frontend && npx vitest run src/lib/format.test.ts`
- Create a migration: `cd backend && uv run alembic revision --autogenerate -m "..."`
- Apply migrations: `make migrate`
- Regenerate frontend API types after backend API changes: `make gen-api`
  (backend must be running on :8000)

## Architecture

- `backend/src/app/main.py` — FastAPI app, mounts `frontend/dist` in
  production.
- `backend/src/app/config.py` — settings (paths, defaults).
- `backend/src/app/db.py` — SQLModel engine/session.
- `backend/src/app/models.py` — SQLModel tables.
- `backend/src/app/api/` — routers: categories, accounts, imports,
  transactions, stats, settings, llm.
- `backend/src/app/ingest/` — the import pipeline:
  - `extract_text.py` — file (PDF/CSV/XLSX) → normalized text chunks.
  - `llm_extract.py` — chunks → extracted transactions (LLM, pydantic
    schema).
  - `classify.py` — rules first, then LLM batch classification with
    few-shot examples.
  - `dedupe.py` — stable hashing + duplicate detection across overlapping
    statements.
  - `pipeline.py` — orchestrates one import as a background job.
- `backend/src/app/llm/client.py` — the only entry point for LLM calls.
- `frontend/src/api/schema.d.ts` — generated from the backend's OpenAPI
  schema via `make gen-api`; never hand-edited.
- `frontend/src/api/client.ts` — the `openapi-fetch` client + `unwrap()`
  error helper.
- `frontend/src/api/types.ts` — hand-written types for the few endpoints
  FastAPI exposes as a generic `dict`/`list` in the OpenAPI schema (stats,
  settings, the transactions list envelope), which `openapi-typescript`
  can't type precisely.
- `frontend/src/api/hooks.ts` — all TanStack Query hooks, one per endpoint.
- `frontend/src/lib/format.ts` — EUR/date/percent formatting (`it-IT`
  locale) and month names; the only place these are formatted.
- `frontend/src/pages/` — Dashboard, Import, Transactions, Settings, each
  with a `dashboard/`, `import/` or `settings/` subfolder for page-local
  components (e.g. `settings/CategoriesTab.tsx`,
  `dashboard/CategoryGrid.tsx`).

## Invariants

- Money is always a **signed integer number of cents** (negative = outflow).
  Never floats.
- `data/` is never committed and must never be read directly by the app's
  tests. Test fixtures for statements are **synthetic** and live under
  `backend/tests/fixtures/`.
- All LLM calls go through `app/llm/client.py`, targeting a local
  OpenAI-compatible server only. There is no cloud LLM integration. A
  warning is shown in the UI if the configured base URL isn't
  localhost/127.0.0.1.
- `chat_json` tries Ollama's native `/api/chat` first (only when
  `llm_base_url` ends in `/v1`, Ollama's convention) to disable "thinking"
  via `think: false`, which cuts latency dramatically on models that honor
  it (e.g. `gemma4:26b-a4b-it-qat`, the default). It falls back silently to
  the portable OpenAI-compatible `/v1/chat/completions` path for any other
  server (LM Studio, llama.cpp, vLLM, ...). Qwen3 models are known to
  ignore both this and the `/no_think` prompt suffix on Ollama — expect
  full chain-of-thought latency with them.
- Aggregation (sums, totals, grids) happens only in the stats SQL queries
  (`api/stats.py`), never duplicated in the frontend.
- Tests mock the LLM client; they never call a real LLM server.
