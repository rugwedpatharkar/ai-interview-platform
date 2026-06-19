from google.protobuf.internal import containers as _containers
from google.protobuf import descriptor as _descriptor
from google.protobuf import message as _message
from collections.abc import Iterable as _Iterable, Mapping as _Mapping
from typing import ClassVar as _ClassVar, Optional as _Optional, Union as _Union

DESCRIPTOR: _descriptor.FileDescriptor

class TalentPoolRequest(_message.Message):
    __slots__ = ()
    def __init__(self) -> None: ...

class TalentEntry(_message.Message):
    __slots__ = ("candidate_user_id", "application_count")
    CANDIDATE_USER_ID_FIELD_NUMBER: _ClassVar[int]
    APPLICATION_COUNT_FIELD_NUMBER: _ClassVar[int]
    candidate_user_id: str
    application_count: int
    def __init__(self, candidate_user_id: _Optional[str] = ..., application_count: _Optional[int] = ...) -> None: ...

class TalentPool(_message.Message):
    __slots__ = ("entries",)
    ENTRIES_FIELD_NUMBER: _ClassVar[int]
    entries: _containers.RepeatedCompositeFieldContainer[TalentEntry]
    def __init__(self, entries: _Optional[_Iterable[_Union[TalentEntry, _Mapping]]] = ...) -> None: ...
