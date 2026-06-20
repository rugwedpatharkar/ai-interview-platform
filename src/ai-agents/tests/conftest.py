import pytest

from app.model.chat import AssistantAnswer
from app.resources.voice.engines import SttError


@pytest.fixture
def fake_llm():
    """Factory: `fake_llm(resp)` -> an LLM whose `structured()` returns `resp`."""

    class _FakeLLM:
        def __init__(self, response):
            self._response = response

        async def structured(self, prompt, schema):
            return self._response

        async def stream(self, prompt):
            text = getattr(self._response, "text", "") or ""
            if text:
                yield text

    return _FakeLLM


@pytest.fixture
def fake_llm_by_schema():
    """Factory: `fake_llm_by_schema({Schema: obj})` -> LLM keyed by output schema.

    For handlers that call the LLM more than once (e.g. Evaluator then Report-Writer),
    each call returns the object registered for its requested output schema.
    """

    class _SchemaLLM:
        def __init__(self, mapping):
            self._mapping = mapping

        async def structured(self, prompt, schema):
            return self._mapping[schema]

        async def stream(self, prompt):
            # The streamed chat answer is plain text — yield the registered
            # AssistantAnswer's text (one chunk; real Gemini yields many).
            text = getattr(self._mapping.get(AssistantAnswer), "text", "") or ""
            if text:
                yield text

    return _SchemaLLM


@pytest.fixture
def fake_capability():
    """Factory: `fake_capability(text, kb=...)` -> a capability gateway.

    `kb` maps topic -> {chunks, citations} for kb_search; embed returns deterministic
    one-dim vectors so RAG handlers run offline without the real Gemini/Qdrant seams.
    """

    class _FakeCapability:
        def __init__(self, text="", kb=None):
            self._text = text
            self._kb = kb or {}
            self.parsed_keys = []
            self.embedded = []
            self.kb_queries = []
            self.ingested = []

        async def parse_document(self, key, owner=None):
            self.parsed_keys.append(key)
            return self._text

        async def embed(self, texts):
            self.embedded.append(texts)
            return [[float(len(t))] for t in texts]

        async def kb_search(self, query, topic, owner="", k=5):
            self.kb_queries.append((query, topic, owner, k))
            return self._kb.get(topic, {"chunks": [], "citations": []})

        async def ingest(self, owner, sources):
            self.ingested.append((owner, sources))
            return {"ingested": len(sources), "skipped": 0}

    return _FakeCapability


@pytest.fixture
def fake_data():
    """Factory: `fake_data(job=...)` -> an in-memory data gateway (profiles, banks)."""

    class _FakeData:
        def __init__(
            self,
            job=None,
            interview_context=None,
            interview_setup=None,
            profile=None,
            match_results=None,
            application_status=None,
            applicants=None,
            proctoring_events=None,
        ):
            self._job = job  # None mirrors a missing job (find_one returns None)
            self._interview_context = interview_context
            self._interview_setup = interview_setup
            self._profile = profile
            self._match_results = list(match_results or [])
            self._application_status = application_status
            self._applicants = list(applicants or [])
            self._proctoring_events = list(proctoring_events or [])
            self.saved_profiles = {}
            self.saved_banks = {}
            self.saved_reports = {}
            self.saved_interviews = {}
            self.saved_match_results = []
            self.saved_question_plans = {}
            self.saved_proctoring = []
            self.status_calls = []
            self.applicant_calls = []

        async def save_profile(self, user_id, doc):
            self.saved_profiles[user_id] = doc

        async def get_job(self, job_id):
            return self._job

        async def save_aptitude_bank(self, job_id, doc):
            self.saved_banks[job_id] = doc

        async def get_aptitude_bank(self, job_id):
            return self.saved_banks.get(job_id)

        async def get_interview_context(self, application_id):
            return self._interview_context

        async def save_report(self, application_id, doc):
            self.saved_reports[application_id] = doc

        async def get_report(self, application_id):
            return self.saved_reports.get(application_id)

        async def get_interview_setup(self, application_id):
            return self._interview_setup

        async def save_interview(self, application_id, doc):
            self.saved_interviews[application_id] = doc

        async def save_proctoring_events(self, application_id, comp_id, docs):
            self.saved_proctoring.append((application_id, comp_id, docs))

        async def get_proctoring_events(self, application_id):
            return list(self._proctoring_events)

        async def get_profile(self, user_id):
            return self._profile

        async def get_match_results(self, job_id=None, candidate_user_id=None):
            return list(self._match_results)

        async def save_match_result(
            self, comp_id, job_id, candidate_user_id, score, reasons
        ):
            self.saved_match_results.append(
                (comp_id, job_id, candidate_user_id, score, reasons)
            )
            key = (job_id, candidate_user_id)
            new = not any(
                (r["job_id"], r["candidate_user_id"]) == key
                for r in self._match_results
            )
            if new:
                self._match_results.append(
                    {"job_id": job_id, "candidate_user_id": candidate_user_id}
                )
            return new

        async def save_question_plan(self, job_id, plan):
            self.saved_question_plans[job_id] = plan

        async def get_question_plan(self, job_id):
            return self.saved_question_plans.get(job_id)

        async def get_application_status(self, scope, application_id):
            self.status_calls.append((scope, application_id))
            return self._application_status

        async def list_applicants(self, scope, job_id):
            self.applicant_calls.append((scope, job_id))
            return list(self._applicants)

    return _FakeData


@pytest.fixture
def fake_publisher():
    """Factory: `fake_publisher()` -> a publisher recording `(key, payload)` events."""

    class _FakePublisher:
        def __init__(self):
            self.events = []

        async def publish(self, routing_key, payload):
            self.events.append((routing_key, payload))

    return _FakePublisher


@pytest.fixture
def fake_sessions():
    """Factory: `fake_sessions()` -> an in-memory InterviewSession store (save/get)."""

    class _FakeSessions:
        def __init__(self):
            self.saved = {}

        async def save(self, session):
            self.saved[session.application_id] = session

        async def get(self, application_id):
            return self.saved.get(application_id)

        async def list_in_progress(self):
            return [s for s in self.saved.values() if s.status == "in_progress"]

    return _FakeSessions


@pytest.fixture
def fake_stt():
    """Factory: `fake_stt()` -> a scripted SttEngine.

    Call ``set_transcripts([...])`` before use; raises ``SttError`` for any
    sentinel value of ``None`` in the transcript list.
    """

    class _FakeSttEngine:
        def __init__(self):
            self._transcripts = iter([])
            self.transcribed = []  # raw PCM bytes received, for assertion

        def set_transcripts(self, transcripts):
            self._transcripts = iter(transcripts)

        async def transcribe(self, pcm16_16k: bytes) -> str:
            self.transcribed.append(pcm16_16k)
            result = next(self._transcripts, "")
            if result is None:
                raise SttError("scripted STT failure")
            return result

    return _FakeSttEngine


@pytest.fixture
def fake_tts():
    """Factory: `fake_tts()` -> a recording TtsEngine.

    Records every text passed to ``synthesize()`` in ``spoken``; yields two
    silence frames (480 zero-bytes each) per call so the transport can consume
    the iterator without needing real audio data.
    """

    class _FakeTtsEngine:
        def __init__(self):
            self.spoken = []  # texts synthesized, in order

        async def synthesize(self, text: str):
            self.spoken.append(text)
            yield b"\x00" * 960  # two 480-sample frames of silence
            yield b"\x00" * 960

    return _FakeTtsEngine


@pytest.fixture
def fake_room():
    """Factory: `fake_room()` -> a scripted RoomAudio.

    Call ``set_utterances([...])`` before use; ``None`` entries signal hangup.
    Records all captions and all PCM iterators passed to ``play()``.
    """

    class _FakeRoomAudio:
        def __init__(self):
            self._utterances = iter([])
            self.captions = []  # list of (who, text)
            self.played = []  # PCM chunks consumed from the TTS iterator
            self.closed = False

        def set_utterances(self, utterances):
            self._utterances = iter(utterances)

        async def play(self, pcm16_48k):
            # Consume the iterator and record each chunk for test assertions.
            async for chunk in pcm16_48k:
                self.played.append(chunk)

        async def next_utterance(self) -> bytes | None:
            return next(self._utterances, None)

        async def send_caption(self, who: str, text: str) -> None:
            self.captions.append((who, text))

        async def aclose(self) -> None:
            self.closed = True

    return _FakeRoomAudio
