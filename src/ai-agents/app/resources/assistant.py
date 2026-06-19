"""Assistant agent: route a chat turn to a scoped tool, then write a cited answer.

The planner LLM picks one intent: `kb_search` (job/tech questions, cited), `status`
(an application's progress), or `ranking` (a job's applicants). Every data call is
threaded with the caller's `scope` so the mcp-data guard enforces tenant + role +
relationship, and untrusted message text is fenced so injections can't redirect it.
"""

from lib.logging import get_logger

from app.model.chat import AssistantPlan
from app.resources._prompt_safety import UNTRUSTED_NOTICE, fence

log = get_logger(component="agent.assistant")


def _transcript(messages):
    return "\n".join(f"{m['role']}: {fence('msg', m['content'])}" for m in messages)


def _planner_prompt(messages):
    return (
        "Route this recruiting-assistant chat turn to one tool. Set `intent`: "
        "`kb_search` for technical/job questions (set `query`), `status` for an "
        "application's progress (set `application_id`), `ranking` for a job's ranked "
        "applicants (set `job_id`), or `chat` for anything else.\n\n"
        f"{UNTRUSTED_NOTICE}\n\n"
        f"Conversation:\n{_transcript(messages)}"
    )


def _answer_prompt(messages, context):
    return (
        "Answer the user's latest message using only the grounding below; be concise "
        "and invent nothing beyond it.\n\n"
        f"{UNTRUSTED_NOTICE}\n\n"
        f"Conversation:\n{_transcript(messages)}\n\n"
        f"Grounding:\n{fence('grounding', context)}"
    )


async def prepare_answer(messages, scope, *, llm, data, capability):
    """Planner + scoped tool fetch -> (answer_prompt, citations).

    Privacy is enforced in the scoped data calls here; the answer is streamed by the
    caller. Raises on a planner/tool failure so the route maps it to a 502 before the
    SSE stream starts.
    """
    plan = await llm.structured(_planner_prompt(messages), AssistantPlan)
    citations, context = [], ""
    if plan.intent == "kb_search":
        owner = scope.get("comp_id") or ""
        result = await capability.kb_search(plan.query, plan.query, owner)
        citations = result.get("citations", [])
        context = " ".join(result.get("chunks", []))
    elif plan.intent == "status":
        status = await data.get_application_status(scope, plan.application_id)
        context = str(status) if status else "No accessible application found."
    elif plan.intent == "ranking":
        applicants = await data.list_applicants(scope, plan.job_id)
        context = str(applicants) if applicants else "No accessible applicants."
    log.info("assistant plan: intent={} citations={}", plan.intent, len(citations))
    return _answer_prompt(messages, context), citations


async def assistant_turn(messages, scope, *, llm, data, capability):
    """Non-streaming convenience (tests / non-SSE callers): collect the stream."""
    prompt, citations = await prepare_answer(
        messages, scope, llm=llm, data=data, capability=capability
    )
    text = "".join([chunk async for chunk in llm.stream(prompt)])
    return {"text": text, "citations": citations}
