from google.protobuf.internal import containers as _containers
from google.protobuf import descriptor as _descriptor
from google.protobuf import message as _message
from collections.abc import Iterable as _Iterable, Mapping as _Mapping
from typing import ClassVar as _ClassVar, Optional as _Optional, Union as _Union

DESCRIPTOR: _descriptor.FileDescriptor

class GetTestRequest(_message.Message):
    __slots__ = ("application_id",)
    APPLICATION_ID_FIELD_NUMBER: _ClassVar[int]
    application_id: str
    def __init__(self, application_id: _Optional[str] = ...) -> None: ...

class AptitudeQuestion(_message.Message):
    __slots__ = ("index", "question", "options", "topic")
    INDEX_FIELD_NUMBER: _ClassVar[int]
    QUESTION_FIELD_NUMBER: _ClassVar[int]
    OPTIONS_FIELD_NUMBER: _ClassVar[int]
    TOPIC_FIELD_NUMBER: _ClassVar[int]
    index: int
    question: str
    options: _containers.RepeatedScalarFieldContainer[str]
    topic: str
    def __init__(self, index: _Optional[int] = ..., question: _Optional[str] = ..., options: _Optional[_Iterable[str]] = ..., topic: _Optional[str] = ...) -> None: ...

class AptitudeTest(_message.Message):
    __slots__ = ("application_id", "questions")
    APPLICATION_ID_FIELD_NUMBER: _ClassVar[int]
    QUESTIONS_FIELD_NUMBER: _ClassVar[int]
    application_id: str
    questions: _containers.RepeatedCompositeFieldContainer[AptitudeQuestion]
    def __init__(self, application_id: _Optional[str] = ..., questions: _Optional[_Iterable[_Union[AptitudeQuestion, _Mapping]]] = ...) -> None: ...

class SubmitRequest(_message.Message):
    __slots__ = ("application_id", "answers")
    APPLICATION_ID_FIELD_NUMBER: _ClassVar[int]
    ANSWERS_FIELD_NUMBER: _ClassVar[int]
    application_id: str
    answers: _containers.RepeatedScalarFieldContainer[int]
    def __init__(self, application_id: _Optional[str] = ..., answers: _Optional[_Iterable[int]] = ...) -> None: ...

class AptitudeResult(_message.Message):
    __slots__ = ("application_id", "score", "passed")
    APPLICATION_ID_FIELD_NUMBER: _ClassVar[int]
    SCORE_FIELD_NUMBER: _ClassVar[int]
    PASSED_FIELD_NUMBER: _ClassVar[int]
    application_id: str
    score: int
    passed: bool
    def __init__(self, application_id: _Optional[str] = ..., score: _Optional[int] = ..., passed: _Optional[bool] = ...) -> None: ...
