from sqlmodel import Session

from app.config import settings
from app.models import Setting

SUPPORTED_LOCALES = ("en", "it")


def resolve_locale(locale: str | None) -> str:
    """Fall back to English for any locale we don't have content for."""
    if locale in SUPPORTED_LOCALES:
        return locale
    return "en"


def get_locale(session: Session) -> str:
    setting = session.get(Setting, "locale")
    return resolve_locale(setting.value if setting else settings.default_locale)


def get_currency(session: Session) -> str:
    """ISO 4217 code amounts are displayed in (display only, no conversion)."""
    setting = session.get(Setting, "currency")
    return setting.value if setting and setting.value else settings.default_currency
