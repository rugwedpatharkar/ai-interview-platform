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

class HoldApplicationRequest(_message.Message):
    __slots__ = ("application_id", "reason_code", "free_text")
    APPLICATION_ID_FIELD_NUMBER: _ClassVar[int]
    REASON_CODE_FIELD_NUMBER: _ClassVar[int]
    FREE_TEXT_FIELD_NUMBER: _ClassVar[int]
    application_id: str
    reason_code: str
    free_text: str
    def __init__(self, application_id: _Optional[str] = ..., reason_code: _Optional[str] = ..., free_text: _Optional[str] = ...) -> None: ...

class HoldApplicationResponse(_message.Message):
    __slots__ = ("application_id", "new_state", "audited_at_ms")
    APPLICATION_ID_FIELD_NUMBER: _ClassVar[int]
    NEW_STATE_FIELD_NUMBER: _ClassVar[int]
    AUDITED_AT_MS_FIELD_NUMBER: _ClassVar[int]
    application_id: str
    new_state: str
    audited_at_ms: int
    def __init__(self, application_id: _Optional[str] = ..., new_state: _Optional[str] = ..., audited_at_ms: _Optional[int] = ...) -> None: ...

class RejectApplicationRequest(_message.Message):
    __slots__ = ("application_id", "reason_code", "free_text")
    APPLICATION_ID_FIELD_NUMBER: _ClassVar[int]
    REASON_CODE_FIELD_NUMBER: _ClassVar[int]
    FREE_TEXT_FIELD_NUMBER: _ClassVar[int]
    application_id: str
    reason_code: str
    free_text: str
    def __init__(self, application_id: _Optional[str] = ..., reason_code: _Optional[str] = ..., free_text: _Optional[str] = ...) -> None: ...

class RejectApplicationResponse(_message.Message):
    __slots__ = ("application_id", "new_state", "audited_at_ms")
    APPLICATION_ID_FIELD_NUMBER: _ClassVar[int]
    NEW_STATE_FIELD_NUMBER: _ClassVar[int]
    AUDITED_AT_MS_FIELD_NUMBER: _ClassVar[int]
    application_id: str
    new_state: str
    audited_at_ms: int
    def __init__(self, application_id: _Optional[str] = ..., new_state: _Optional[str] = ..., audited_at_ms: _Optional[int] = ...) -> None: ...
