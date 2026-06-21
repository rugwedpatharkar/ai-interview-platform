"""JD-assistant agent: draft/polish a job description from a recruiter's brief.

The brief is untrusted text, so it's fenced; the LLM returns a polished JD plus a few
improvement suggestions, grounded in the brief.
"""

from lib.logging import get_logger

from app.model.jd import JdDraft
from app.resources._prompt_safety import UNTRUSTED_NOTICE, fence

log = get_logger(component="agent.jd_assistant")


def _prompt(brief):
    return (
        "Help a recruiter write a clear, inclusive software/IT job description. "
        "Produce a polished `jd_text` and 2-4 short `suggestions` to strengthen it; "
        "keep claims grounded in the brief and invent no company facts.\n\n"
        f"{UNTRUSTED_NOTICE}\n\n"
        f"Recruiter brief:\n{fence('brief', brief)}"
    )


async def improve_jd(brief, *, llm) -> JdDraft:
    draft = await llm.structured(_prompt(brief), JdDraft)
    log.info(
        "jd improved: {} chars, {} suggestions",
        len(draft.jd_text),
        len(draft.suggestions),
    )
    return draft
