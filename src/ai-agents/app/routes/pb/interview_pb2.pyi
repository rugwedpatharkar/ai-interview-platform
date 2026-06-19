from google.protobuf.internal import containers as _containers
from google.protobuf import descriptor as _descriptor
from google.protobuf import message as _message
from collections.abc import Iterable as _Iterable, Mapping as _Mapping
from typing import ClassVar as _ClassVar, Optional as _Optional, Union as _Union

DESCRIPTOR: _descriptor.FileDescriptor

class StartInterviewRequest(_message.Message):
    __slots__ = ("application_id",)
    APPLICATION_ID_FIELD_NUMBER: _ClassVar[int]
    application_id: str
    def __init__(self, application_id: _Optional[str] = ...) -> None: ...

class QuestionResponse(_message.Message):
    __slots__ = ("question",)
    QUESTION_FIELD_NUMBER: _ClassVar[int]
    question: str
    def __init__(self, question: _Optional[str] = ...) -> None: ...

class SubmitTurnRequest(_message.Message):
    __slots__ = ("application_id", "answer")
    APPLICATION_ID_FIELD_NUMBER: _ClassVar[int]
    ANSWER_FIELD_NUMBER: _ClassVar[int]
    application_id: str
    answer: str
    def __init__(self, application_id: _Optional[str] = ..., answer: _Optional[str] = ...) -> None: ...

class TurnResponse(_message.Message):
    __slots__ = ("done", "question")
    DONE_FIELD_NUMBER: _ClassVar[int]
    QUESTION_FIELD_NUMBER: _ClassVar[int]
    done: bool
    question: str
    def __init__(self, done: _Optional[bool] = ..., question: _Optional[str] = ...) -> None: ...

class ProctorEvent(_message.Message):
    __slots__ = ("type", "at", "meta_json")
    TYPE_FIELD_NUMBER: _ClassVar[int]
    AT_FIELD_NUMBER: _ClassVar[int]
    META_JSON_FIELD_NUMBER: _ClassVar[int]
    type: str
    at: str
    meta_json: str
    def __init__(self, type: _Optional[str] = ..., at: _Optional[str] = ..., meta_json: _Optional[str] = ...) -> None: ...

class ProctorEventsRequest(_message.Message):
    __slots__ = ("application_id", "events")
    APPLICATION_ID_FIELD_NUMBER: _ClassVar[int]
    EVENTS_FIELD_NUMBER: _ClassVar[int]
    application_id: str
    events: _containers.RepeatedCompositeFieldContainer[ProctorEvent]
    def __init__(self, application_id: _Optional[str] = ..., events: _Optional[_Iterable[_Union[ProctorEvent, _Mapping]]] = ...) -> None: ...

class ProctorAccepted(_message.Message):
    __slots__ = ("accepted",)
    ACCEPTED_FIELD_NUMBER: _ClassVar[int]
    accepted: int
    def __init__(self, accepted: _Optional[int] = ...) -> None: ...

class RtcTokenRequest(_message.Message):
    __slots__ = ("application_id",)
    APPLICATION_ID_FIELD_NUMBER: _ClassVar[int]
    application_id: str
    def __init__(self, application_id: _Optional[str] = ...) -> None: ...

class RtcTokenResponse(_message.Message):
    __slots__ = ("url", "token", "room")
    URL_FIELD_NUMBER: _ClassVar[int]
    TOKEN_FIELD_NUMBER: _ClassVar[int]
    ROOM_FIELD_NUMBER: _ClassVar[int]
    url: str
    token: str
    room: str
    def __init__(self, url: _Optional[str] = ..., token: _Optional[str] = ..., room: _Optional[str] = ...) -> None: ...
