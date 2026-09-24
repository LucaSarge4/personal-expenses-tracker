import os
import tempfile
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

# Point the app at a throwaway data dir before any app module is imported,
# so tests never touch the real data/ directory.
_TEST_DATA_DIR = Path(tempfile.mkdtemp(prefix="expenses-tracker-tests-"))
os.environ["DATA_DIR"] = str(_TEST_DATA_DIR)


@pytest.fixture(scope="session", autouse=True)
def _setup_db():
    from sqlmodel import Session

    from app.db import engine
    from app.main import run_migrations
    from app.seed import seed_all

    run_migrations()
    with Session(engine) as session:
        seed_all(session)


@pytest.fixture(scope="session")
def client():
    from app.main import app

    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture
def italian_pdf_statement(tmp_path):
    """A small synthetic bank statement PDF, Italian conventions (dd/mm/yyyy, comma decimals)."""
    from reportlab.lib.pagesizes import A4
    from reportlab.pdfgen import canvas

    path = tmp_path / "statement.pdf"
    c = canvas.Canvas(str(path), pagesize=A4)
    lines = [
        "Estratto Conto - Gennaio 2026",
        "Saldo iniziale: 1.000,00",
        "",
        "Data       Descrizione                  Dare      Avere",
        "05/01/2026 ESSELUNGA MILANO             25,50",
        "10/01/2026 BONIFICO STIPENDIO                     1.500,00",
        "15/01/2026 ENEL ENERGIA                 60,00",
        "",
        "Saldo finale: 2.414,50",
    ]
    y = 800
    for line in lines:
        c.drawString(40, y, line)
        y -= 20
    c.save()
    return path


@pytest.fixture
def italian_csv_statement(tmp_path):
    """A `;`-delimited CSV with Italian comma-decimal amounts."""
    path = tmp_path / "statement.csv"
    content = (
        "Data;Descrizione;Importo\n"
        "05/01/2026;ESSELUNGA MILANO;-25,50\n"
        "10/01/2026;BONIFICO STIPENDIO;1.500,00\n"
        "15/01/2026;ENEL ENERGIA;-60,00\n"
    )
    path.write_text(content, encoding="utf-8")
    return path


@pytest.fixture
def italian_xlsx_statement(tmp_path):
    from openpyxl import Workbook

    path = tmp_path / "statement.xlsx"
    wb = Workbook()
    ws = wb.active
    ws.append(["Data", "Descrizione", "Importo"])
    ws.append(["05/01/2026", "ESSELUNGA MILANO", "-25,50"])
    ws.append(["10/01/2026", "BONIFICO STIPENDIO", "1.500,00"])
    ws.append(["15/01/2026", "ENEL ENERGIA", "-60,00"])
    wb.save(path)
    return path
