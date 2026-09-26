from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

REPO_ROOT = Path(__file__).resolve().parents[3]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="")

    data_dir: Path = REPO_ROOT / "data"
    default_llm_base_url: str = "http://localhost:11434/v1"
    default_llm_model: str = "gemma4:26b-a4b-it-qat"
    default_locale: str = "en"
    default_currency: str = "EUR"

    @property
    def db_path(self) -> Path:
        return self.data_dir / "expenses.db"

    @property
    def statements_dir(self) -> Path:
        return self.data_dir / "bank-account-statements"

    @property
    def backups_dir(self) -> Path:
        return self.data_dir / "backups"


settings = Settings()
