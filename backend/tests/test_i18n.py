from app.i18n import resolve_locale


def test_resolve_locale_passes_through_supported() -> None:
    assert resolve_locale("it") == "it"
    assert resolve_locale("en") == "en"


def test_resolve_locale_falls_back_to_english() -> None:
    assert resolve_locale("fr") == "en"
    assert resolve_locale(None) == "en"
    assert resolve_locale("") == "en"
