# Personal Expenses Tracker

[![CI](https://github.com/LucaSarge4/personal-expenses-tracker/actions/workflows/ci.yml/badge.svg)](https://github.com/LucaSarge4/personal-expenses-tracker/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)
![Python 3.12](https://img.shields.io/badge/python-3.12-3776AB?logo=python&logoColor=white)
![Node 22+](https://img.shields.io/badge/node-22%2B-339933?logo=node.js&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-009688?logo=fastapi&logoColor=white)
![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)
![Local LLM: Ollama](https://img.shields.io/badge/LLM-Ollama%20%28local%29-000000?logo=ollama&logoColor=white)

**Track your spending from your bank statements, privately.** Drop in the
statements you already get from your banks, and a local AI model reads them,
sorts every transaction into your categories, and turns them into a clear
picture of where your money goes. Nothing leaves your computer.

![24-second demo: importing a statement, adding transactions by hand, the dashboard and accent colors](./expenses-demo.gif)

Demo recorded on the synthetic demo dataset.
[Download the full-quality video with sound](./expenses-promo.mp4) (MP4, 11 MB).

## Contents

- [About the app](#about-the-app)
- [Features](#features)
- [Quick start](#quick-start)
- [Installation](#installation)
- [Using the app](#using-the-app)
- [Your data](#your-data)
- [Configuration](#configuration)
- [Privacy and security](#privacy-and-security)
- [Development](#development)
- [License](#license)

## About the app

Most expense apps either want your bank login or make you type every
purchase. This one sits in between: once a month you download your
statements (PDF, CSV or Excel, from any bank) and drop them in. A language
model running **on your own machine** extracts the transactions and
classifies them, learning from your corrections. You review the result in a
couple of minutes, and the dashboard does the rest.

It is a single-user app that runs locally in your browser. Your data is a
SQLite file in a folder you control: no account, no cloud, no subscription.

The interface is available in **English** and **Italian**, and works on
desktop and phone.

## Features

**Import statements with a local AI**
- Upload PDF, CSV and XLSX statements, several at once, from different banks.
- A local LLM extracts the date, description and amount of each transaction,
  whatever the statement's layout or language.
- Transactions are classified into your categories using your own rules
  first, then the LLM with examples of your past choices.
- Duplicates from overlapping statements are detected and skipped
  automatically.
- A review step highlights low-confidence classifications before anything is
  confirmed.

**Manage transactions**
- Add, edit and delete single transactions by hand: no statement or AI
  needed.
- Enter many transactions at once in a spreadsheet-style view (Enter jumps to
  the next row).
- Filter by period or custom date range, account, category, uncategorized,
  income or expense, amount range, manual or imported, and "needs review".
  Filters live in the URL, so you can bookmark a view.
- Recategorize one transaction and get offered to move similar ones in one
  click, or turn a correction into a rule for future imports.
- Add notes to any transaction.

**Understand your spending**
- Year and month views with income, expenses, net and savings rate compared
  to the previous period.
- Income vs expenses charts and a breakdown by category.
- A sheet-style category × month grid with group subtotals; click any cell
  to see the transactions behind it.

**Get advice**
- Ask the local LLM to analyze a month, a year or all time and suggest
  practical improvements.
- Ask free-form questions about your own spending ("can I afford this?").

**Make it yours**
- Your own categories, groups, accounts and rules, editable at any time.
- English or Italian, and a display currency (EUR, USD, GBP, CHF, ...).
- Light or dark theme and six accent colors.

**Stay in control of your data**
- Everything runs locally; a warning appears if the LLM server isn't on your
  machine.
- Automatic database backup before every import.
- A "danger zone" to wipe transactions, imports, rules, categories or
  accounts if you want to start over.

## Quick start

Try the app with fake data in three commands. No AI model needed for this.

```sh
git clone https://github.com/LucaSarge4/personal-expenses-tracker.git
cd personal-expenses-tracker
make install
make demo
```

Then open <http://127.0.0.1:8000>. The demo uses a fully synthetic dataset in
[`data-dist/`](data-dist/) and never touches your real data.

## Installation

### Prerequisites

- [uv](https://docs.astral.sh/uv/), for the Python 3.12 backend.
- [Node.js](https://nodejs.org) 22 or newer, with npm, for the frontend.
- A local OpenAI-compatible LLM server, needed to import statements and get
  advice (see below).

### Install the app

```sh
make install   # installs backend and frontend dependencies
make start     # builds the frontend and serves the app
```

Open <http://127.0.0.1:8000>. On first run the app creates its database in
`data/` with a starter set of categories.

### Set up a local LLM

**Ollama (recommended)**

1. Install [Ollama](https://ollama.com) and start it (`ollama serve`, or the
   desktop app).
2. Pull the default model:
   ```sh
   ollama pull gemma4:26b-a4b-it-qat
   ```
   It's a mixture-of-experts model (about 4B active parameters out of 26B),
   so it's fast for its size, but it still needs roughly 16 GB of free
   RAM/VRAM. On smaller machines pick a smaller instruction-tuned model:
   extraction gets less accurate, but it works.
3. That's it: Ollama serves an OpenAI-compatible API at
   `http://localhost:11434/v1`, which is the app's default.

With Ollama the app turns off the model's "thinking" mode, which makes it
much faster. Qwen3 models ignore this setting, so expect them to be slower.

**Other servers**: LM Studio, llama.cpp, vLLM, MLX and anything else that
exposes an OpenAI-compatible `/v1/chat/completions` endpoint work too.

**Connect it in the app**: in **Settings → LLM**, pick a preset (Ollama or
LM Studio) or type a URL, choose a model from the server's list, optionally
set an API key, and press **Test connection**.

## Using the app

### Running modes

| Command | What it does |
| --- | --- |
| `make start` | Builds the frontend and serves the whole app on `127.0.0.1:8000`, using your data in `data/`. |
| `make demo` | Same, but with the synthetic demo dataset in `data-dist/`. |
| `make dev` | Development mode: backend with auto-reload on `:8000`, frontend with hot reload on `127.0.0.1:5173`. |

### Monthly workflow

1. **Import**: open Import, choose the account and drop in the month's
   statements. To try it with the demo, upload
   [`data-dist/fake-statement.csv`](data-dist/fake-statement.csv).
2. **Review**: check the extracted transactions. Low-confidence ones are
   highlighted. Fix categories inline, optionally save a correction as a
   rule, then confirm.
3. **Dashboard**: see the month or the year at a glance, and drill into any
   category from the grid.
4. **Advice**: ask the AI for suggestions or a specific question about your
   spending.

### Adding transactions by hand

For cash, a missing statement or quick corrections, use **Add transaction**
on the Transactions page. To type a batch, for example a receipt or a
month of cash expenses, use **Add several**: one row per transaction, Enter
to move on, one click to save them all. Transactions added by hand are
marked as reviewed and count in your totals right away.

## Your data

Everything lives under `data/`, which is gitignored and never committed:

| Path | Contents |
| --- | --- |
| `data/expenses.db` | The SQLite database |
| `data/bank-account-statements/` | The uploaded statement files, one folder per account |
| `data/backups/` | Automatic database backups taken before each import (the last 20 are kept) |

**Backing up** is just copying the `data/` folder somewhere safe.

## Configuration

All settings can be changed from the Settings page. These optional
environment variables only set the starting values of a fresh database:

| Variable | Default | Purpose |
| --- | --- | --- |
| `DATA_DIR` | `./data` | Where the database, statements and backups live |
| `DEFAULT_LLM_BASE_URL` | `http://localhost:11434/v1` | Initial LLM server URL |
| `DEFAULT_LLM_MODEL` | `gemma4:26b-a4b-it-qat` | Initial LLM model |
| `DEFAULT_LOCALE` | `en` | Initial language (`en` or `it`) and starter categories |

For example, `DEFAULT_LOCALE=it make start` on the first run gives you an
Italian interface and Italian categories.

## Privacy and security

- **Your data stays on your machine.** Statements are read by an LLM server
  you run yourself; the app has no cloud integration. If the configured LLM
  URL isn't `localhost`/`127.0.0.1`, the app warns you that statements would
  leave your computer.
- **Localhost only.** This is a single-user tool with no login, including on
  the danger zone that can delete all your data. `make start`, `make demo`
  and `make dev` bind to `127.0.0.1`. Don't expose the app to your network
  or the internet (for example by binding to `0.0.0.0`): anyone who could
  reach it would have full access.

## Development

The stack:

- **Backend**: FastAPI, SQLModel, SQLite and Alembic, in Python 3.12 managed
  with uv.
- **Frontend**: React 19, Vite, Tailwind CSS v4, Radix UI, TanStack Query and
  Recharts.

| Command | What it does |
| --- | --- |
| `make dev` | Run with hot reload |
| `make test` | Backend (pytest) and frontend (Vitest) tests |
| `make lint` | Ruff, oxlint and the TypeScript compiler |
| `make format` | Format the backend with Ruff |
| `make gen-api` | Regenerate frontend API types after backend API changes |
| `make migrate` | Apply database migrations |
| `make demo-data` | Regenerate the synthetic demo dataset |

CI runs the same lint and test checks on every push and pull request. See
[AGENTS.md](./AGENTS.md) for the architecture, testing conventions and the
rules the code relies on (for example: money is always stored as integer
cents).

Issues and pull requests are welcome.

## License

[MIT](./LICENSE) © 2026 Luca Sargenti
