from scripts.seed_coding_task import build_seed_task

from app.model.coding import CodingTask


def test_seed_builds_valid_task():
    task = CodingTask(**build_seed_task("j1"))  # round-trips through the model
    assert task.job_id == "j1"
    assert task.sample_cases and task.hidden_cases
    assert task.languages == ["python"]


def test_seed_reference_solution_passes_its_own_hidden_cases():
    # Guardrail: the seed's human-verified cases must agree with a correct solution
    # (mirrors the reference-solution gate the LLM-authoring follow-up will enforce).
    doc = build_seed_task("j1")
    for case in doc["hidden_cases"]:
        a, b = map(int, case["stdin"].split())
        assert str(a + b) == case["expected_stdout"]
