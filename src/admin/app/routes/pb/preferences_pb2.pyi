from google.protobuf import descriptor as _descriptor
from google.protobuf import message as _message
from typing import ClassVar as _ClassVar, Optional as _Optional

DESCRIPTOR: _descriptor.FileDescriptor

class GetAppearanceRequest(_message.Message):
    __slots__ = ()
    def __init__(self) -> None: ...

class Appearance(_message.Message):
    __slots__ = ("mode", "base", "accent", "accent_hue")
    MODE_FIELD_NUMBER: _ClassVar[int]
    BASE_FIELD_NUMBER: _ClassVar[int]
    ACCENT_FIELD_NUMBER: _ClassVar[int]
    ACCENT_HUE_FIELD_NUMBER: _ClassVar[int]
    mode: str
    base: str
    accent: str
    accent_hue: int
    def __init__(self, mode: _Optional[str] = ..., base: _Optional[str] = ..., accent: _Optional[str] = ..., accent_hue: _Optional[int] = ...) -> None: ...
