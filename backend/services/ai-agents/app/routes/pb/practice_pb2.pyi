from google.protobuf.internal import containers as _containers
from google.protobuf import descriptor as _descriptor
from google.protobuf import message as _message
from collections.abc import Iterable as _Iterable, Mapping as _Mapping
from typing import ClassVar as _ClassVar, Optional as _Optional, Union as _Union

DESCRIPTOR: _descriptor.FileDescriptor

class StartPracticeRequest(_message.Message):
    __slots__ = ("topic", "jd_text")
    TOPIC_FIELD_NUMBER: _ClassVar[int]
    JD_TEXT_FIELD_NUMBER: _ClassVar[int]
    topic: str
    jd_text: str
    def __init__(self, topic: _Optional[str] = ..., jd_text: _Optional[str] = ...) -> None: ...

class QuestionResponse(_message.Message):
    __slots__ = ("practice_id", "question")
    PRACTICE_ID_FIELD_NUMBER: _ClassVar[int]
    QUESTION_FIELD_NUMBER: _ClassVar[int]
    practice_id: str
    question: str
    def __init__(self, practice_id: _Optional[str] = ..., question: _Optional[str] = ...) -> None: ...

class SubmitPracticeTurnRequest(_message.Message):
    __slots__ = ("practice_id", "answer")
    PRACTICE_ID_FIELD_NUMBER: _ClassVar[int]
    ANSWER_FIELD_NUMBER: _ClassVar[int]
    practice_id: str
    answer: str
    def __init__(self, practice_id: _Optional[str] = ..., answer: _Optional[str] = ...) -> None: ...

class TurnResponse(_message.Message):
    __slots__ = ("done", "question")
    DONE_FIELD_NUMBER: _ClassVar[int]
    QUESTION_FIELD_NUMBER: _ClassVar[int]
    done: bool
    question: str
    def __init__(self, done: _Optional[bool] = ..., question: _Optional[str] = ...) -> None: ...

class ListPracticeSessionsRequest(_message.Message):
    __slots__ = ()
    def __init__(self) -> None: ...

class PracticeSession(_message.Message):
    __slots__ = ("practice_id", "role_label", "created_at")
    PRACTICE_ID_FIELD_NUMBER: _ClassVar[int]
    ROLE_LABEL_FIELD_NUMBER: _ClassVar[int]
    CREATED_AT_FIELD_NUMBER: _ClassVar[int]
    practice_id: str
    role_label: str
    created_at: str
    def __init__(self, practice_id: _Optional[str] = ..., role_label: _Optional[str] = ..., created_at: _Optional[str] = ...) -> None: ...

class PracticeSessionList(_message.Message):
    __slots__ = ("sessions",)
    SESSIONS_FIELD_NUMBER: _ClassVar[int]
    sessions: _containers.RepeatedCompositeFieldContainer[PracticeSession]
    def __init__(self, sessions: _Optional[_Iterable[_Union[PracticeSession, _Mapping]]] = ...) -> None: ...

class GetPracticeFeedbackRequest(_message.Message):
    __slots__ = ("practice_id",)
    PRACTICE_ID_FIELD_NUMBER: _ClassVar[int]
    practice_id: str
    def __init__(self, practice_id: _Optional[str] = ...) -> None: ...

class GrowthFeedback(_message.Message):
    __slots__ = ("summary", "strengths", "gaps", "suggested_topics")
    SUMMARY_FIELD_NUMBER: _ClassVar[int]
    STRENGTHS_FIELD_NUMBER: _ClassVar[int]
    GAPS_FIELD_NUMBER: _ClassVar[int]
    SUGGESTED_TOPICS_FIELD_NUMBER: _ClassVar[int]
    summary: str
    strengths: _containers.RepeatedScalarFieldContainer[str]
    gaps: _containers.RepeatedScalarFieldContainer[str]
    suggested_topics: _containers.RepeatedScalarFieldContainer[str]
    def __init__(self, summary: _Optional[str] = ..., strengths: _Optional[_Iterable[str]] = ..., gaps: _Optional[_Iterable[str]] = ..., suggested_topics: _Optional[_Iterable[str]] = ...) -> None: ...

class PracticeFeedback(_message.Message):
    __slots__ = ("evaluation_summary", "feedback")
    EVALUATION_SUMMARY_FIELD_NUMBER: _ClassVar[int]
    FEEDBACK_FIELD_NUMBER: _ClassVar[int]
    evaluation_summary: str
    feedback: GrowthFeedback
    def __init__(self, evaluation_summary: _Optional[str] = ..., feedback: _Optional[_Union[GrowthFeedback, _Mapping]] = ...) -> None: ...
