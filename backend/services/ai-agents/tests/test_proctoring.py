"""Typed proctoring catalog: unknown types rejected, severity is server-canonical."""

import pytest
from pydantic import ValidationError

from app.model.proctoring import ProctoringEvent, integrity_score, severity_of


def test_unknown_type_is_rejected():
    # The client can only send a catalog type; anything else is a 422 at the boundary.
    with pytest.raises(ValidationError):
        ProctoringEvent(type="totally_made_up", at="2026-06-19T00:00:00Z")


def test_severity_is_canonical_not_client_supplied():
    # ProctoringEvent has NO severity field — it can't be spoofed; severity_of decides.
    assert "severity" not in ProctoringEvent.model_fields
    assert severity_of("second_face") == "high"
    assert severity_of("tab_hidden") == "low"


def test_integrity_score_weights_high_events_above_low():
    high = ProctoringEvent(type="second_face", at="t")
    lows = [ProctoringEvent(type="tab_hidden", at="t") for _ in range(3)]
    assert integrity_score([high]) > integrity_score(lows)
