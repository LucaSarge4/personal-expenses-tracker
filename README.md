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

**Languages**: the UI, the LLM prompts and the default categories are
available in English and Italian (English is the default and the fallback).
Switch language from Settings → General, or set `DEFAULT_LOCALE=it` before
the first run so a fresh database is seeded with Italian categories.
Statements in other languages usually still work, since the LLM does the
extraction regardless of the statement language.

## Prerequisites

- [uv](https://docs.astral.sh/uv/) (Python 3.12 backend).
- Node 22+ (npm) for the frontend.
- A local OpenAI-compatible LLM server (see below).

## Local LLM setup

The app needs a local LLM to extract transactions from statements, classify
them, and generate advice. Browsing the demo dataset works without one.

**Ollama (recommended)**

1. Install [Ollama](https://ollama.com) and start it (`ollama serve`, or the
   desktop app).
2. Pull the default model:
   ```
   ollama pull gemma4:26b-a4b-it-qat
   ```
   It is a MoE model (~4B active params out of 26B), QAT-quantized, so it is
   fast for its size, but it still needs roughly 16 GB+ of free RAM/VRAM.
   On smaller machines pick a smaller instruction-tuned model: extraction
   quality drops, but it works.
3. Ollama serves an OpenAI-compatible API at `http://localhost:11434/v1`,
   which is the app's default, so no configuration is needed.

With Ollama the app automatically disables the model's "thinking" mode
(native `/api/chat` with `think: false`), which cuts latency a lot. Qwen3
models ignore this on Ollama, so expect them to be much slower.

**Other servers** (LM Studio, llama.cpp, vLLM, MLX, ...): anything exposing
an OpenAI-compatible `/v1/chat/completions` endpoint works. Set its base URL
and model in the app.

**Configuring it in the app**: Settings → LLM lets you pick a preset base
URL (Ollama / LM Studio) or type your own, choose a model from the server's
list, set an optional API key, and **Test connection**. A warning is shown if
the base URL is not `localhost`/`127.0.0.1`, since statements would then
leave your machine.

## Setup

```
make install
make demo      # try it with the synthetic demo data, no LLM needed
make start     # use it for real, with your own data in data/
```

Then open http://127.0.0.1:8000.

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

## Configuration

Environment variables (all optional). The `DEFAULT_*` ones only seed a
fresh database; after that, everything is edited from the Settings page.

| Variable | Default | Purpose |
| --- | --- | --- |
| `DATA_DIR` | `./data` | Where the database, statements and backups live |
| `DEFAULT_LLM_BASE_URL` | `http://localhost:11434/v1` | Initial LLM server URL |
| `DEFAULT_LLM_MODEL` | `gemma4:26b-a4b-it-qat` | Initial LLM model |
| `DEFAULT_LOCALE` | `en` | Initial language (`en` or `it`) and default categories |

## Development

See [AGENTS.md](./AGENTS.md) for commands, architecture and invariants.
`make lint` and `make test` run the same checks as CI.

## License

[MIT](./LICENSE)
