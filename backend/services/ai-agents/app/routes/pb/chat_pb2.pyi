from google.protobuf.internal import containers as _containers
from google.protobuf import descriptor as _descriptor
from google.protobuf import message as _message
from collections.abc import Iterable as _Iterable, Mapping as _Mapping
from typing import ClassVar as _ClassVar, Optional as _Optional, Union as _Union

DESCRIPTOR: _descriptor.FileDescriptor

class ChatMessage(_message.Message):
    __slots__ = ("role", "content")
    ROLE_FIELD_NUMBER: _ClassVar[int]
    CONTENT_FIELD_NUMBER: _ClassVar[int]
    role: str
    content: str
    def __init__(self, role: _Optional[str] = ..., content: _Optional[str] = ...) -> None: ...

class ChatRequest(_message.Message):
    __slots__ = ("messages",)
    MESSAGES_FIELD_NUMBER: _ClassVar[int]
    messages: _containers.RepeatedCompositeFieldContainer[ChatMessage]
    def __init__(self, messages: _Optional[_Iterable[_Union[ChatMessage, _Mapping]]] = ...) -> None: ...

class Citation(_message.Message):
    __slots__ = ("url", "topic", "snippet")
    URL_FIELD_NUMBER: _ClassVar[int]
    TOPIC_FIELD_NUMBER: _ClassVar[int]
    SNIPPET_FIELD_NUMBER: _ClassVar[int]
    url: str
    topic: str
    snippet: str
    def __init__(self, url: _Optional[str] = ..., topic: _Optional[str] = ..., snippet: _Optional[str] = ...) -> None: ...

class Done(_message.Message):
    __slots__ = ()
    def __init__(self) -> None: ...

class ChatEvent(_message.Message):
    __slots__ = ("text", "citation", "done", "error")
    TEXT_FIELD_NUMBER: _ClassVar[int]
    CITATION_FIELD_NUMBER: _ClassVar[int]
    DONE_FIELD_NUMBER: _ClassVar[int]
    ERROR_FIELD_NUMBER: _ClassVar[int]
    text: str
    citation: Citation
    done: Done
    error: str
    def __init__(self, text: _Optional[str] = ..., citation: _Optional[_Union[Citation, _Mapping]] = ..., done: _Optional[_Union[Done, _Mapping]] = ..., error: _Optional[str] = ...) -> None: ...
