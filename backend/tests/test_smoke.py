from app.main import app


def test_app_loads() -> None:
    assert app is not None
    assert app.title.startswith("SMTMS")
