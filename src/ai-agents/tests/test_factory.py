import pytest

from app.config import Settings
from app.infra.factory import get_llm, get_scoring_llm


def test_rejects_unknown_provider():
    with pytest.raises(ValueError, match="unsupported llm_provider"):
        get_llm(Settings(llm_provider="acme-llm"))


def test_scoring_llm_rejects_unknown_provider():
    with pytest.raises(ValueError, match="unsupported llm_provider"):
        get_scoring_llm(Settings(llm_provider="acme-llm"))


def test_scoring_temperature_is_deterministic_by_default():
    # The evaluator must be repeatable for auditable, fair scoring.
    assert Settings().llm_scoring_temperature == 0.0
