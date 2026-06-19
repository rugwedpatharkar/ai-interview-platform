from google.protobuf import descriptor as _descriptor
from google.protobuf import message as _message
from typing import ClassVar as _ClassVar, Optional as _Optional

DESCRIPTOR: _descriptor.FileDescriptor

class DecideRequest(_message.Message):
    __slots__ = ("application_id", "outcome")
    APPLICATION_ID_FIELD_NUMBER: _ClassVar[int]
    OUTCOME_FIELD_NUMBER: _ClassVar[int]
    application_id: str
    outcome: str
    def __init__(self, application_id: _Optional[str] = ..., outcome: _Optional[str] = ...) -> None: ...

class OverrideGateRequest(_message.Message):
    __slots__ = ("application_id",)
    APPLICATION_ID_FIELD_NUMBER: _ClassVar[int]
    application_id: str
    def __init__(self, application_id: _Optional[str] = ...) -> None: ...

class DecisionResponse(_message.Message):
    __slots__ = ("application_id", "state")
    APPLICATION_ID_FIELD_NUMBER: _ClassVar[int]
    STATE_FIELD_NUMBER: _ClassVar[int]
    application_id: str
    state: str
    def __init__(self, application_id: _Optional[str] = ..., state: _Optional[str] = ...) -> None: ...
