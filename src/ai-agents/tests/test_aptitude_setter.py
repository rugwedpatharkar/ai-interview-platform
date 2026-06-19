import pytest

from app.model.aptitude import AptitudeBank, AptitudeQuestion
from app.resources.aptitude_setter import build_aptitude_bank


def _bank(n):
    return AptitudeBank(
        questions=[
            AptitudeQuestion(
                question=f"q{i}",
                options=["a", "b", "c", "d"],
                correct_index=0,
                topic="python",
            )
            for i in range(n)
        ]
    )


async def test_builds_valid_bank(fake_llm):
    bank = await build_aptitude_bank("JD text", ["python"], 5, llm=fake_llm(_bank(5)))
    assert len(bank.questions) == 5
    assert bank.questions[0].topic == "python"


async def test_rejects_wrong_question_count(fake_llm):
    with pytest.raises(ValueError):
        await build_aptitude_bank("JD", ["python"], 5, llm=fake_llm(_bank(3)))


async def test_rejects_ungradeable_question(fake_llm):
    bad = AptitudeBank(
        questions=[
            AptitudeQuestion(
                question="q", options=["a", "b"], correct_index=5, topic="python"
            )
        ]
    )
    with pytest.raises(ValueError):
        await build_aptitude_bank("JD", ["python"], 1, llm=fake_llm(bad))
