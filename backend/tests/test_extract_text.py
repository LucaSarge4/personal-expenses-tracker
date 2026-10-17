import pytest

from app.ingest.extract_text import DEFAULT_CHUNK_LINES, UnsupportedFile, _get_chunk_lines, extract


def test_extract_pdf(italian_pdf_statement) -> None:
    chunks = extract(italian_pdf_statement)
    assert len(chunks) >= 1
    joined = "\n".join(chunks)
    assert "ESSELUNGA" in joined
    assert "05/01/2026" in joined


def test_extract_csv_semicolon_delimited(italian_csv_statement) -> None:
    chunks = extract(italian_csv_statement)
    assert len(chunks) >= 1
    joined = "\n".join(chunks)
    assert "ESSELUNGA MILANO" in joined
    assert "-25,50" in joined
    assert "Descrizione" in joined


def test_extract_xlsx(italian_xlsx_statement) -> None:
    chunks = extract(italian_xlsx_statement)
    assert len(chunks) >= 1
    joined = "\n".join(chunks)
    assert "BONIFICO STIPENDIO" in joined
    assert "1.500,00" in joined


def test_extract_unsupported_file(tmp_path) -> None:
    path = tmp_path / "statement.txt"
    path.write_text("not a real statement")
    with pytest.raises(UnsupportedFile):
        extract(path)


def test_extract_chunks_repeat_header(tmp_path, monkeypatch) -> None:
    monkeypatch.setattr("app.ingest.extract_text._get_chunk_lines", lambda: 2)
    path = tmp_path / "many_rows.csv"
    rows = "\n".join(f"0{i}/01/2026;ROW {i};-{i},00" for i in range(1, 6))
    path.write_text(f"Data;Descrizione;Importo\n{rows}\n", encoding="utf-8")

    chunks = extract(path)
    assert len(chunks) > 1
    for chunk in chunks:
        assert "Data" in chunk and "Descrizione" in chunk


def test_extract_csv_latin1_encoding(tmp_path) -> None:
    """Older bank exports are often Windows/latin-1 encoded, not UTF-8."""
    path = tmp_path / "latin1.csv"
    path.write_bytes(
        "Data;Descrizione;Importo\n05/01/2026;CAFFÈ CENTRALE;-3,20\n".encode("latin-1")
    )
    assert "CAFFÈ CENTRALE" in "\n".join(extract(path))


def test_extract_csv_comma_delimited(tmp_path) -> None:
    path = tmp_path / "comma.csv"
    path.write_text("Date,Description,Amount\n2026-01-05,COFFEE SHOP,-3.20\n", encoding="utf-8")
    joined = "\n".join(extract(path))
    assert "| 2026-01-05 | COFFEE SHOP | -3.20 |" in joined


def test_extract_csv_skips_blank_rows_and_handles_empty_files(tmp_path) -> None:
    path = tmp_path / "blank_rows.csv"
    path.write_text("Data;Descrizione;Importo\n;;\n05/01/2026;BAR;-1,00\n\n", encoding="utf-8")
    lines = "\n".join(extract(path)).splitlines()
    assert lines == [
        "| Data | Descrizione | Importo |",
        "| --- | --- | --- |",
        "| 05/01/2026 | BAR | -1,00 |",
    ]

    empty = tmp_path / "empty.csv"
    empty.write_text("\n;;\n", encoding="utf-8")
    assert extract(empty) == []


def test_extract_xlsx_empty_sheet(tmp_path) -> None:
    from openpyxl import Workbook

    path = tmp_path / "empty.xlsx"
    Workbook().save(path)
    assert extract(path) == []


def test_extract_xlsx_drops_empty_rows_and_columns(tmp_path) -> None:
    from openpyxl import Workbook

    path = tmp_path / "padded.xlsx"
    wb = Workbook()
    ws = wb.active
    ws.append([])
    ws.append([None, "Data", "Descrizione", "Importo"])
    ws.append([None, "05/01/2026", "BAR", "-1,00"])
    wb.save(path)
    lines = "\n".join(extract(path)).splitlines()
    assert lines[0] == "| Data | Descrizione | Importo |"
    assert lines[2] == "| 05/01/2026 | BAR | -1,00 |"


def test_extract_pdf_tables_become_markdown_with_repeated_header(tmp_path, monkeypatch) -> None:
    from reportlab.lib.pagesizes import A4
    from reportlab.platypus import SimpleDocTemplate, Table, TableStyle

    monkeypatch.setattr("app.ingest.extract_text._get_chunk_lines", lambda: 3)
    path = tmp_path / "table.pdf"
    data = [["Data", "Descrizione", "Importo"]] + [
        [f"0{i}/01/2026", f"SHOP {i}", f"-{i},00"] for i in range(1, 6)
    ]
    table = Table(data)
    table.setStyle(TableStyle([("GRID", (0, 0), (-1, -1), 0.5, "black")]))
    SimpleDocTemplate(str(path), pagesize=A4).build([table])

    chunks = extract(path)
    assert len(chunks) > 1
    assert chunks[0].startswith("| Data | Descrizione | Importo |")
    for chunk in chunks[1:]:
        assert chunk.splitlines()[0] == "| Data | Descrizione | Importo |"
    assert "| 05/01/2026 | SHOP 5 | -5,00 |" in "\n".join(chunks)


@pytest.mark.parametrize(
    ("stored", "expected"),
    [(None, DEFAULT_CHUNK_LINES), ("25", 25), ("not-a-number", DEFAULT_CHUNK_LINES)],
)
def test_chunk_size_setting(stored, expected) -> None:
    from sqlmodel import Session

    from app.db import engine
    from app.models import Setting

    with Session(engine) as session:
        original = session.get(Setting, "extract_chunk_lines")
        original_value = original.value if original else None
        if stored is None:
            if original:
                session.delete(original)
        elif original:
            original.value = stored
        else:
            session.add(Setting(key="extract_chunk_lines", value=stored))
        session.commit()
    try:
        assert _get_chunk_lines() == expected
    finally:
        with Session(engine) as session:
            row = session.get(Setting, "extract_chunk_lines")
            if original_value is None:
                if row:
                    session.delete(row)
            elif row:
                row.value = original_value
            else:
                session.add(Setting(key="extract_chunk_lines", value=original_value))
            session.commit()
