"""Domain errors for the interview host, mapped to HTTP status by the route layer."""


class InterviewError(Exception):
    """Base for interview-host domain errors."""


class NotFoundError(InterviewError):
    pass


class ForbiddenError(InterviewError):
    pass


class LLMError(Exception):
    """An LLM call failed after exhausting retries (transient or malformed output)."""
