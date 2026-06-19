"""Matcher agent: candidate profile + JD -> a deterministic fit score + reasons.

The score is the cosine similarity of the profile and JD embeddings: deterministic
for fixed inputs and a fixed embedder, so the same candidate/job always scores the
same. The temp-0 LLM only writes the reasons. Untrusted profile/JD text is fenced so
an injection in either can't steer the rationale.
"""

import math

from lib.logging import get_logger

from app.model.scoring import MatchRationale, MatchResult
from app.resources._prompt_safety import UNTRUSTED_NOTICE, fence

log = get_logger(component="agent.matcher")


def _profile_text(profile):
    skills = ", ".join(profile.skills)
    experience = "; ".join(f"{e.title} at {e.company}" for e in profile.experience)
    return f"{profile.headline}. Skills: {skills}. Experience: {experience}"


def _cosine(a, b):
    dot = sum(x * y for x, y in zip(a, b, strict=False))
    na = math.sqrt(sum(x * x for x in a))
    nb = math.sqrt(sum(y * y for y in b))
    return dot / (na * nb) if na and nb else 0.0


def _prompt(profile_text, jd_text):
    return (
        "You are matching a candidate to a software/IT job. Give 2-4 short bullet "
        "reasons for how the candidate's skills and experience fit (or miss) the job. "
        "Cite concrete skills; invent nothing.\n\n"
        f"{UNTRUSTED_NOTICE}\n\n"
        f"Candidate:\n{fence('candidate', profile_text)}\n\n"
        f"Job description:\n{fence('jd', jd_text)}"
    )


async def match(profile, jd_text, *, embedder, llm) -> MatchResult:
    profile_text = _profile_text(profile)
    # Reject empty inputs: cosine would return a real-looking 0.0 and persist a fake
    # score. Raising dead-letters the event so the missing profile/JD gets fixed.
    if not jd_text.strip() or not (
        profile.headline.strip() or profile.skills or profile.experience
    ):
        raise ValueError("match requires a non-empty profile and jd_text")
    profile_vec, jd_vec = await embedder.embed([profile_text, jd_text])
    score = round(max(0.0, _cosine(profile_vec, jd_vec)), 4)
    rationale = await llm.structured(_prompt(profile_text, jd_text), MatchRationale)
    log.info("match scored {:.4f} ({} reasons)", score, len(rationale.reasons))
    return MatchResult(score=score, reasons=rationale.reasons)
