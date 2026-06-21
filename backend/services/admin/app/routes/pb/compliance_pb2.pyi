from google.protobuf.internal import containers as _containers
from google.protobuf import descriptor as _descriptor
from google.protobuf import message as _message
from collections.abc import Iterable as _Iterable, Mapping as _Mapping
from typing import ClassVar as _ClassVar, Optional as _Optional, Union as _Union

DESCRIPTOR: _descriptor.FileDescriptor

class RecordConsentRequest(_message.Message):
    __slots__ = ("scope", "terms_version")
    SCOPE_FIELD_NUMBER: _ClassVar[int]
    TERMS_VERSION_FIELD_NUMBER: _ClassVar[int]
    scope: str
    terms_version: str
    def __init__(self, scope: _Optional[str] = ..., terms_version: _Optional[str] = ...) -> None: ...

class GetMyConsentRequest(_message.Message):
    __slots__ = ()
    def __init__(self) -> None: ...

class ConsentReceipt(_message.Message):
    __slots__ = ("user_id", "scope", "terms_version")
    USER_ID_FIELD_NUMBER: _ClassVar[int]
    SCOPE_FIELD_NUMBER: _ClassVar[int]
    TERMS_VERSION_FIELD_NUMBER: _ClassVar[int]
    user_id: str
    scope: str
    terms_version: str
    def __init__(self, user_id: _Optional[str] = ..., scope: _Optional[str] = ..., terms_version: _Optional[str] = ...) -> None: ...

class ConsentItem(_message.Message):
    __slots__ = ("scope", "terms_version", "granted_at")
    SCOPE_FIELD_NUMBER: _ClassVar[int]
    TERMS_VERSION_FIELD_NUMBER: _ClassVar[int]
    GRANTED_AT_FIELD_NUMBER: _ClassVar[int]
    scope: str
    terms_version: str
    granted_at: str
    def __init__(self, scope: _Optional[str] = ..., terms_version: _Optional[str] = ..., granted_at: _Optional[str] = ...) -> None: ...

class ConsentList(_message.Message):
    __slots__ = ("items",)
    ITEMS_FIELD_NUMBER: _ClassVar[int]
    items: _containers.RepeatedCompositeFieldContainer[ConsentItem]
    def __init__(self, items: _Optional[_Iterable[_Union[ConsentItem, _Mapping]]] = ...) -> None: ...

class EraseMeRequest(_message.Message):
    __slots__ = ()
    def __init__(self) -> None: ...

class EraseReceipt(_message.Message):
    __slots__ = ("user_id", "erased")
    USER_ID_FIELD_NUMBER: _ClassVar[int]
    ERASED_FIELD_NUMBER: _ClassVar[int]
    user_id: str
    erased: bool
    def __init__(self, user_id: _Optional[str] = ..., erased: _Optional[bool] = ...) -> None: ...
