from google.protobuf.internal import containers as _containers
from google.protobuf import descriptor as _descriptor
from google.protobuf import message as _message
from collections.abc import Iterable as _Iterable, Mapping as _Mapping
from typing import ClassVar as _ClassVar, Optional as _Optional, Union as _Union

DESCRIPTOR: _descriptor.FileDescriptor

class AlertFilters(_message.Message):
    __slots__ = ("location", "remote_mode", "employment_type", "experience_level", "skills")
    LOCATION_FIELD_NUMBER: _ClassVar[int]
    REMOTE_MODE_FIELD_NUMBER: _ClassVar[int]
    EMPLOYMENT_TYPE_FIELD_NUMBER: _ClassVar[int]
    EXPERIENCE_LEVEL_FIELD_NUMBER: _ClassVar[int]
    SKILLS_FIELD_NUMBER: _ClassVar[int]
    location: str
    remote_mode: str
    employment_type: str
    experience_level: str
    skills: _containers.RepeatedScalarFieldContainer[str]
    def __init__(self, location: _Optional[str] = ..., remote_mode: _Optional[str] = ..., employment_type: _Optional[str] = ..., experience_level: _Optional[str] = ..., skills: _Optional[_Iterable[str]] = ...) -> None: ...

class CreateAlertRequest(_message.Message):
    __slots__ = ("keyword", "filters", "frequency")
    KEYWORD_FIELD_NUMBER: _ClassVar[int]
    FILTERS_FIELD_NUMBER: _ClassVar[int]
    FREQUENCY_FIELD_NUMBER: _ClassVar[int]
    keyword: str
    filters: AlertFilters
    frequency: str
    def __init__(self, keyword: _Optional[str] = ..., filters: _Optional[_Union[AlertFilters, _Mapping]] = ..., frequency: _Optional[str] = ...) -> None: ...

class JobAlert(_message.Message):
    __slots__ = ("alert_id", "keyword", "filters", "frequency", "created_at", "last_run_at")
    ALERT_ID_FIELD_NUMBER: _ClassVar[int]
    KEYWORD_FIELD_NUMBER: _ClassVar[int]
    FILTERS_FIELD_NUMBER: _ClassVar[int]
    FREQUENCY_FIELD_NUMBER: _ClassVar[int]
    CREATED_AT_FIELD_NUMBER: _ClassVar[int]
    LAST_RUN_AT_FIELD_NUMBER: _ClassVar[int]
    alert_id: str
    keyword: str
    filters: AlertFilters
    frequency: str
    created_at: str
    last_run_at: str
    def __init__(self, alert_id: _Optional[str] = ..., keyword: _Optional[str] = ..., filters: _Optional[_Union[AlertFilters, _Mapping]] = ..., frequency: _Optional[str] = ..., created_at: _Optional[str] = ..., last_run_at: _Optional[str] = ...) -> None: ...

class ListAlertsRequest(_message.Message):
    __slots__ = ()
    def __init__(self) -> None: ...

class ListAlertsResponse(_message.Message):
    __slots__ = ("alerts",)
    ALERTS_FIELD_NUMBER: _ClassVar[int]
    alerts: _containers.RepeatedCompositeFieldContainer[JobAlert]
    def __init__(self, alerts: _Optional[_Iterable[_Union[JobAlert, _Mapping]]] = ...) -> None: ...

class DeleteAlertRequest(_message.Message):
    __slots__ = ("alert_id",)
    ALERT_ID_FIELD_NUMBER: _ClassVar[int]
    alert_id: str
    def __init__(self, alert_id: _Optional[str] = ...) -> None: ...

class DeleteAlertResponse(_message.Message):
    __slots__ = ("deleted",)
    DELETED_FIELD_NUMBER: _ClassVar[int]
    deleted: bool
    def __init__(self, deleted: _Optional[bool] = ...) -> None: ...
