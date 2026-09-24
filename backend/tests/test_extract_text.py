import pytest

from app.ingest.extract_text import UnsupportedFile, extract


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
