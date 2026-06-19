"""Profile agent: resume text -> a structured CandidateProfile.

The resume text is produced upstream by the document-parsing capability
(mcp-capability `parse_document`); this agent only structures it via the LLM and
never invents facts the resume does not contain.
"""

from lib.logging import get_logger

from app.model.profile import CandidateProfile
from app.resources._prompt_safety import UNTRUSTED_NOTICE, fence

log = get_logger(component="agent.profile_parser")


def _prompt(resume_text):
    return (
        "Extract a structured candidate profile from this resume: a one-line "
        "headline, skills, work experience (company, title, one-line summary), "
        "education, and total years of professional experience. Leave fields empty "
        "where the resume is silent — never invent facts.\n\n"
        f"{UNTRUSTED_NOTICE}\n\nResume:\n" + fence("resume", resume_text)
    )


async def parse_profile(resume_text, *, llm) -> CandidateProfile:
    if not resume_text.strip():
        raise ValueError("resume text is empty — nothing to parse")
    profile = await llm.structured(_prompt(resume_text), CandidateProfile)
    log.info(
        "profile parsed: {} skills, {} roles",
        len(profile.skills),
        len(profile.experience),
    )
    return profile
