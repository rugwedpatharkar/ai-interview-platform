"""Settings validation: cap/limit fields must reject non-positive values and carry
correct defaults matching the former hardcoded module constants."""

import pytest
from pydantic import ValidationError

from app.config import Settings


def test_settings_cap_defaults():
    s = Settings()
    assert s.default_aptitude_questions == 10
    assert s.max_chat_messages == 50
    assert s.max_proctor_events == 200


def test_settings_cap_rejects_non_positive():
    with pytest.raises(ValidationError):
        Settings(default_aptitude_questions=0)
    with pytest.raises(ValidationError):
        Settings(max_chat_messages=-1)
    with pytest.raises(ValidationError):
        Settings(max_proctor_events=0)
