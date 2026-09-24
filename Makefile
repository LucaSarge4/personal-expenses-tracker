.PHONY: install dev start lint format test gen-api migrate seed-demo demo-data demo

install:
	cd backend && uv sync
	cd frontend && npm install

dev:
	cd backend && uv run uvicorn app.main:app --reload --host 127.0.0.1 --port 8000 & \
	cd frontend && npm run dev

start:
	cd frontend && npm run build
	cd backend && uv run uvicorn app.main:app --host 127.0.0.1 --port 8000

lint:
	cd backend && uv run ruff check .
	cd frontend && npm run lint && npx tsc --noEmit

format:
	cd backend && uv run ruff format .

test:
	cd backend && uv run pytest
	cd frontend && npx vitest run

gen-api:
	cd frontend && npm run gen:api

migrate:
	cd backend && uv run alembic upgrade head

seed-demo:
	cd backend && DATA_DIR=../.demo-data uv run python -m app.seed

# Regenerate the committed, fully synthetic demo dataset under data-dist/.
demo-data:
	rm -f data-dist/expenses.db
	cd backend && DATA_DIR=../data-dist uv run python -m app.gen_demo_data

# Run the app against the synthetic demo dataset instead of your real data/.
demo:
	cd frontend && npm run build
	cd backend && DATA_DIR=../data-dist uv run uvicorn app.main:app --host 127.0.0.1 --port 8000
