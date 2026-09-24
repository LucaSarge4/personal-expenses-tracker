# Personal Expenses Tracker

A local-only expenses tracker. Drop in bank statements (PDF, CSV, XLSX) from
several banks, and a local LLM extracts and classifies the transactions into
your own categories. A dashboard shows the result, filterable by year or
month.

**Privacy**: nothing ever leaves your machine. All extraction and
classification runs against a local OpenAI-compatible LLM server (Ollama, LM
Studio, llama.cpp, ...). All personal data — the SQLite database and the
uploaded statements — lives under `data/`, which is gitignored and never
committed.

**Security**: this is a single-user, localhost-only tool. There is no
authentication anywhere, including on the Settings "danger zone" that can
permanently delete all your data. Both `make dev` and `make start` bind to
`127.0.0.1` only — do not change this to `0.0.0.0` or otherwise expose the
app beyond your own machine, since anyone who can reach it has full access
and no login is required.

**Locale**: built around my own Italian bank statements (default categories,
LLM prompts for the Advice feature, and date/currency formatting are all
Italian/EUR). It should still work for other locales for the core
import → review → dashboard flow (the LLM does the extraction/classification
regardless of statement language), but expect to edit categories, rules, and
some hardcoded Italian strings to fit your own bank and language.

## Prerequisites

- [uv](https://docs.astral.sh/uv/) for the Python backend.
- Node 22+ (npm) for the frontend.
- A local OpenAI-compatible LLM server, for example:
  - [Ollama](https://ollama.com) (recommended): `ollama pull gemma4:26b-a4b-it-qat`,
    served at `http://localhost:11434/v1`. This is a MoE model (only ~4B
    active params despite the 26B total), QAT-quantized, and — unlike
    Qwen3 — it correctly honors Ollama's native "no thinking" mode, which
    the app uses automatically for a large speedup when talking to Ollama.
  - Any other OpenAI-compatible local server (LM Studio, llama.cpp, vLLM,
    MLX) also works, served at its own base URL — configurable in Settings.
    Thinking-mode suppression is best-effort there since it relies on the
    model/server honoring a "no_think" instruction in the prompt.

## Setup

```
make install
```

## Running

- `make dev` — runs the backend (uvicorn, reload) on `127.0.0.1:8000` and the
  frontend (Vite) on `127.0.0.1:5173`, with `/api` proxied to the backend.
- `make start` — builds the frontend and serves everything from FastAPI on
  `127.0.0.1:8000`. Everything binds to localhost only.
- `make demo` — same as `make start`, but points `DATA_DIR` at
  [`data-dist/`](data-dist/), a small, fully synthetic dataset committed to
  the repo (fake accounts, fake transactions) so you can try the app without
  importing your own statements first. Regenerate it with `make demo-data`;
  nothing in it is derived from real data. Your real `data/` directory is
  never touched by this.
  [`data-dist/fake-statement.csv`](data-dist/fake-statement.csv) is a small,
  fully synthetic bank statement you can upload through Import to demo the
  ingest pipeline live, then delete the resulting import afterwards.

## Monthly workflow

1. **Import**: go to the Import page, pick an account, and drop in the
   month's bank statement(s) (PDF, CSV or XLSX).
2. **Review**: once extraction and classification finish, review the
   transactions. Low-confidence classifications are highlighted. Fix
   categories inline, optionally turning a correction into a rule for future
   imports, and confirm.
3. **Dashboard**: see the year or month view, with income/expense charts, a
   category breakdown, and a sheet-style category × month grid.
4. **Advice**: ask the local LLM to analyze a period (all time, a year, or a
   month) and give practical suggestions, or ask it a free-form question
   about your own spending (e.g. "can I afford this?").

Categories, rules and accounts are editable at any time from the Settings
page, which also has a "danger zone" to permanently delete data by type
(transactions, imports, rules, categories, accounts) if you want to start
over.

## Data & backups

Everything lives under `data/` (gitignored, never committed):

- `data/expenses.db` — the SQLite database.
- `data/bank-account-statements/` — the uploaded statement files, one folder
  per account.
- `data/backups/` — automatic database backups taken before each import (the
  last 20 are kept).

To back up the app, copy the `data/` directory elsewhere.

## Development

See [AGENTS.md](./AGENTS.md) for commands, architecture and invariants.
