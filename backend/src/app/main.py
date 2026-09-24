from contextlib import asynccontextmanager

from alembic.config import Config
from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from sqlmodel import Session

from alembic import command
from app.api import accounts, admin, categories, imports, llm, rules, stats, transactions
from app.api import settings as settings_router
from app.config import REPO_ROOT
from app.db import engine
from app.seed import seed_all

FRONTEND_DIST = REPO_ROOT / "frontend" / "dist"


def run_migrations() -> None:
    alembic_cfg = Config(str(REPO_ROOT / "backend" / "alembic.ini"))
    alembic_cfg.set_main_option("script_location", str(REPO_ROOT / "backend" / "alembic"))
    command.upgrade(alembic_cfg, "head")


@asynccontextmanager
async def lifespan(_app: FastAPI):
    run_migrations()
    with Session(engine) as session:
        seed_all(session)
    yield


app = FastAPI(title="Personal Expenses Tracker", lifespan=lifespan)

app.include_router(categories.router)
app.include_router(accounts.router)
app.include_router(rules.router)
app.include_router(settings_router.router)
app.include_router(llm.router)
app.include_router(imports.router)
app.include_router(transactions.router)
app.include_router(stats.router)
app.include_router(admin.router)


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


# Production serving: `make start` builds the frontend first, so
# frontend/dist exists. In `make dev`, Vite serves the frontend on its own
# port instead and this directory is absent, so the app runs API-only.
if FRONTEND_DIST.is_dir():

    @app.get("/{full_path:path}")
    def serve_spa(full_path: str) -> FileResponse:
        if full_path.startswith("api/"):
            raise HTTPException(status_code=404, detail="Not found")
        candidate = FRONTEND_DIST / full_path
        if full_path and candidate.is_file():
            return FileResponse(candidate)
        return FileResponse(FRONTEND_DIST / "index.html")
