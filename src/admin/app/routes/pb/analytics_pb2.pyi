from google.protobuf.internal import containers as _containers
from google.protobuf import descriptor as _descriptor
from google.protobuf import message as _message
from collections.abc import Iterable as _Iterable, Mapping as _Mapping
from typing import ClassVar as _ClassVar, Optional as _Optional, Union as _Union

DESCRIPTOR: _descriptor.FileDescriptor

class FunnelAnalyticsRequest(_message.Message):
    __slots__ = ()
    def __init__(self) -> None: ...

class JobScoreRequest(_message.Message):
    __slots__ = ("job_id",)
    JOB_ID_FIELD_NUMBER: _ClassVar[int]
    job_id: str
    def __init__(self, job_id: _Optional[str] = ...) -> None: ...

class ScoreDistribution(_message.Message):
    __slots__ = ("count", "min", "max", "mean", "p25", "p50", "p75")
    COUNT_FIELD_NUMBER: _ClassVar[int]
    MIN_FIELD_NUMBER: _ClassVar[int]
    MAX_FIELD_NUMBER: _ClassVar[int]
    MEAN_FIELD_NUMBER: _ClassVar[int]
    P25_FIELD_NUMBER: _ClassVar[int]
    P50_FIELD_NUMBER: _ClassVar[int]
    P75_FIELD_NUMBER: _ClassVar[int]
    count: int
    min: float
    max: float
    mean: float
    p25: float
    p50: float
    p75: float
    def __init__(self, count: _Optional[int] = ..., min: _Optional[float] = ..., max: _Optional[float] = ..., mean: _Optional[float] = ..., p25: _Optional[float] = ..., p50: _Optional[float] = ..., p75: _Optional[float] = ...) -> None: ...

class StateCount(_message.Message):
    __slots__ = ("state", "count")
    STATE_FIELD_NUMBER: _ClassVar[int]
    COUNT_FIELD_NUMBER: _ClassVar[int]
    state: str
    count: int
    def __init__(self, state: _Optional[str] = ..., count: _Optional[int] = ...) -> None: ...

class FunnelAnalytics(_message.Message):
    __slots__ = ("states", "total", "conversion_rate")
    STATES_FIELD_NUMBER: _ClassVar[int]
    TOTAL_FIELD_NUMBER: _ClassVar[int]
    CONVERSION_RATE_FIELD_NUMBER: _ClassVar[int]
    states: _containers.RepeatedCompositeFieldContainer[StateCount]
    total: int
    conversion_rate: float
    def __init__(self, states: _Optional[_Iterable[_Union[StateCount, _Mapping]]] = ..., total: _Optional[int] = ..., conversion_rate: _Optional[float] = ...) -> None: ...
