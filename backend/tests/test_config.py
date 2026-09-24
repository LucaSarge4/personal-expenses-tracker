from app.config import settings
from app.db import engine


def test_data_dir_is_overridden_by_env() -> None:
    assert "expenses-tracker-tests-" in str(settings.data_dir)


def test_db_engine_imports() -> None:
    assert engine is not None
