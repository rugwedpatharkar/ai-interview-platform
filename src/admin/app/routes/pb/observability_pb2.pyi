from collections.abc import Iterable as _Iterable
from collections.abc import Mapping as _Mapping
from typing import ClassVar as _ClassVar

from google.protobuf import descriptor as _descriptor
from google.protobuf import message as _message
from google.protobuf.internal import containers as _containers

DESCRIPTOR: _descriptor.FileDescriptor

class ClientErrorPayload(_message.Message):
    __slots__ = ("message", "name", "stack_truncated_8k")
    NAME_FIELD_NUMBER: _ClassVar[int]
    MESSAGE_FIELD_NUMBER: _ClassVar[int]
    STACK_TRUNCATED_8K_FIELD_NUMBER: _ClassVar[int]
    name: str
    message: str
    stack_truncated_8k: str
    def __init__(
        self,
        name: str | None = ...,
        message: str | None = ...,
        stack_truncated_8k: str | None = ...,
    ) -> None: ...

class ClientErrorEvent(_message.Message):
    __slots__ = (
        "build_sha",
        "component",
        "correlation_id",
        "error",
        "event_id",
        "occurred_at_ms",
        "route",
        "user_agent_hash",
    )
    CORRELATION_ID_FIELD_NUMBER: _ClassVar[int]
    EVENT_ID_FIELD_NUMBER: _ClassVar[int]
    OCCURRED_AT_MS_FIELD_NUMBER: _ClassVar[int]
    COMPONENT_FIELD_NUMBER: _ClassVar[int]
    ROUTE_FIELD_NUMBER: _ClassVar[int]
    BUILD_SHA_FIELD_NUMBER: _ClassVar[int]
    USER_AGENT_HASH_FIELD_NUMBER: _ClassVar[int]
    ERROR_FIELD_NUMBER: _ClassVar[int]
    correlation_id: str
    event_id: str
    occurred_at_ms: int
    component: str
    route: str
    build_sha: str
    user_agent_hash: str
    error: ClientErrorPayload
    def __init__(
        self,
        correlation_id: str | None = ...,
        event_id: str | None = ...,
        occurred_at_ms: int | None = ...,
        component: str | None = ...,
        route: str | None = ...,
        build_sha: str | None = ...,
        user_agent_hash: str | None = ...,
        error: ClientErrorPayload | _Mapping | None = ...,
    ) -> None: ...

class RecordClientErrorRequest(_message.Message):
    __slots__ = ("events",)
    EVENTS_FIELD_NUMBER: _ClassVar[int]
    events: _containers.RepeatedCompositeFieldContainer[ClientErrorEvent]
    def __init__(
        self, events: _Iterable[ClientErrorEvent | _Mapping] | None = ...
    ) -> None: ...

class RecordClientErrorResponse(_message.Message):
    __slots__ = ("accepted_event_ids",)
    ACCEPTED_EVENT_IDS_FIELD_NUMBER: _ClassVar[int]
    accepted_event_ids: _containers.RepeatedScalarFieldContainer[str]
    def __init__(self, accepted_event_ids: _Iterable[str] | None = ...) -> None: ...

class ClientEvent(_message.Message):
    __slots__ = (
        "correlation_id",
        "event_id",
        "name",
        "occurred_at_ms",
        "properties_json",
        "route",
    )
    CORRELATION_ID_FIELD_NUMBER: _ClassVar[int]
    EVENT_ID_FIELD_NUMBER: _ClassVar[int]
    OCCURRED_AT_MS_FIELD_NUMBER: _ClassVar[int]
    NAME_FIELD_NUMBER: _ClassVar[int]
    ROUTE_FIELD_NUMBER: _ClassVar[int]
    PROPERTIES_JSON_FIELD_NUMBER: _ClassVar[int]
    correlation_id: str
    event_id: str
    occurred_at_ms: int
    name: str
    route: str
    properties_json: str
    def __init__(
        self,
        correlation_id: str | None = ...,
        event_id: str | None = ...,
        occurred_at_ms: int | None = ...,
        name: str | None = ...,
        route: str | None = ...,
        properties_json: str | None = ...,
    ) -> None: ...

class RecordClientEventRequest(_message.Message):
    __slots__ = ("events",)
    EVENTS_FIELD_NUMBER: _ClassVar[int]
    events: _containers.RepeatedCompositeFieldContainer[ClientEvent]
    def __init__(
        self, events: _Iterable[ClientEvent | _Mapping] | None = ...
    ) -> None: ...

class RecordClientEventResponse(_message.Message):
    __slots__ = ("accepted_event_ids",)
    ACCEPTED_EVENT_IDS_FIELD_NUMBER: _ClassVar[int]
    accepted_event_ids: _containers.RepeatedScalarFieldContainer[str]
    def __init__(self, accepted_event_ids: _Iterable[str] | None = ...) -> None: ...
