from google.protobuf.internal import containers as _containers
from google.protobuf import descriptor as _descriptor
from google.protobuf import message as _message
from collections.abc import Iterable as _Iterable
from typing import ClassVar as _ClassVar, Optional as _Optional

DESCRIPTOR: _descriptor.FileDescriptor

class ImproveJdRequest(_message.Message):
    __slots__ = ("brief",)
    BRIEF_FIELD_NUMBER: _ClassVar[int]
    brief: str
    def __init__(self, brief: _Optional[str] = ...) -> None: ...

class JdResponse(_message.Message):
    __slots__ = ("jd_text", "suggestions")
    JD_TEXT_FIELD_NUMBER: _ClassVar[int]
    SUGGESTIONS_FIELD_NUMBER: _ClassVar[int]
    jd_text: str
    suggestions: _containers.RepeatedScalarFieldContainer[str]
    def __init__(self, jd_text: _Optional[str] = ..., suggestions: _Optional[_Iterable[str]] = ...) -> None: ...
