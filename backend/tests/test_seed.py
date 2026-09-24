from sqlmodel import Session, SQLModel, create_engine, select

from app.models import Category, Setting
from app.seed import SEED_CATEGORIES_BY_LOCALE, seed_all


def test_seed_is_idempotent() -> None:
    engine = create_engine("sqlite://")
    SQLModel.metadata.create_all(engine)

    with Session(engine) as session:
        seed_all(session)
        seed_all(session)

        categories = session.exec(select(Category)).all()
        assert len(categories) == len(SEED_CATEGORIES_BY_LOCALE["en"])

        settings_rows = session.exec(select(Setting)).all()
        assert {s.key for s in settings_rows} == {
            "llm_base_url",
            "llm_model",
            "extract_chunk_lines",
            "classify_batch_size",
            "llm_timeout_s",
            "locale",
        }


def test_seed_category_locales_have_matching_kinds() -> None:
    en, it = SEED_CATEGORIES_BY_LOCALE["en"], SEED_CATEGORIES_BY_LOCALE["it"]
    assert len(en) == len(it)
    assert [c["kind"] for c in en] == [c["kind"] for c in it]
