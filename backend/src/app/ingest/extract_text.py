import csv
import io
from pathlib import Path

import pandas as pd
import pdfplumber
from sqlmodel import Session

from app.db import engine
from app.models import Setting

DEFAULT_CHUNK_LINES = 60


class UnsupportedFile(Exception):
    pass


def _get_chunk_lines() -> int:
    with Session(engine) as session:
        setting = session.get(Setting, "extract_chunk_lines")
    if setting is None:
        return DEFAULT_CHUNK_LINES
    try:
        return int(setting.value)
    except ValueError:
        return DEFAULT_CHUNK_LINES


def _rows_to_markdown_table(rows: list[list[str]]) -> str:
    if not rows:
        return ""
    header, *body = rows
    lines = [
        "| " + " | ".join(str(c) for c in header) + " |",
        "| " + " | ".join("---" for _ in header) + " |",
    ]
    for row in body:
        lines.append("| " + " | ".join(str(c) for c in row) + " |")
    return "\n".join(lines)


def _chunk_lines_with_header(lines: list[str], header: str | None, chunk_size: int) -> list[str]:
    if not lines:
        return []
    chunks = []
    for i in range(0, len(lines), chunk_size):
        piece = lines[i : i + chunk_size]
        if header and i > 0:
            piece = [header, *piece]
        chunks.append("\n".join(piece))
    return chunks


def _extract_pdf(path: Path, chunk_size: int) -> list[str]:
    all_lines: list[str] = []
    header: str | None = None
    with pdfplumber.open(path) as pdf:
        for page in pdf.pages:
            tables = page.extract_tables()
            if tables:
                for table in tables:
                    rows = [[cell or "" for cell in row] for row in table if row]
                    if not rows:
                        continue
                    if header is None:
                        header = "| " + " | ".join(str(c) for c in rows[0]) + " |"
                    md = _rows_to_markdown_table(rows)
                    all_lines.extend(md.splitlines())
            else:
                text = page.extract_text() or ""
                all_lines.extend(text.splitlines())
    return _chunk_lines_with_header(all_lines, header, chunk_size)


def _sniff_csv_dialect(sample: str) -> str:
    try:
        dialect = csv.Sniffer().sniff(sample, delimiters=";,")
        return dialect.delimiter
    except csv.Error:
        return ";" if sample.count(";") >= sample.count(",") else ","


def _read_csv_text(path: Path) -> str:
    for encoding in ("utf-8", "latin-1"):
        try:
            return path.read_text(encoding=encoding)
        except UnicodeDecodeError:
            continue
    raise UnsupportedFile(f"Could not decode CSV file: {path}")


def _extract_csv(path: Path, chunk_size: int) -> list[str]:
    text = _read_csv_text(path)
    delimiter = _sniff_csv_dialect(text[:4096])
    reader = csv.reader(io.StringIO(text), delimiter=delimiter)
    rows = [row for row in reader if any(cell.strip() for cell in row)]
    if not rows:
        return []
    header, *body = rows
    header_md = "| " + " | ".join(header) + " |"
    lines = _rows_to_markdown_table(rows).splitlines()
    return _chunk_lines_with_header(lines, header_md, chunk_size)


def _extract_xlsx(path: Path, chunk_size: int) -> list[str]:
    df = pd.read_excel(path, sheet_name=0, header=None)
    df = df.dropna(axis=0, how="all").dropna(axis=1, how="all")
    if df.empty:
        return []
    rows = df.astype(str).values.tolist()
    header_md = "| " + " | ".join(rows[0]) + " |"
    lines = _rows_to_markdown_table(rows).splitlines()
    return _chunk_lines_with_header(lines, header_md, chunk_size)


def extract(path: str | Path) -> list[str]:
    path = Path(path)
    chunk_size = _get_chunk_lines()
    suffix = path.suffix.lower()
    if suffix == ".pdf":
        return _extract_pdf(path, chunk_size)
    if suffix == ".csv":
        return _extract_csv(path, chunk_size)
    if suffix in (".xlsx", ".xls"):
        return _extract_xlsx(path, chunk_size)
    raise UnsupportedFile(f"Unsupported file type: {suffix}")
