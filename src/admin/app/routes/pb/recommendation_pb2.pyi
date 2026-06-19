from google.protobuf.internal import containers as _containers
from google.protobuf import descriptor as _descriptor
from google.protobuf import message as _message
from collections.abc import Iterable as _Iterable, Mapping as _Mapping
from typing import ClassVar as _ClassVar, Optional as _Optional, Union as _Union

DESCRIPTOR: _descriptor.FileDescriptor

class CandidateRecommendationsRequest(_message.Message):
    __slots__ = ()
    def __init__(self) -> None: ...

class JobRankedRequest(_message.Message):
    __slots__ = ("job_id",)
    JOB_ID_FIELD_NUMBER: _ClassVar[int]
    job_id: str
    def __init__(self, job_id: _Optional[str] = ...) -> None: ...

class Match(_message.Message):
    __slots__ = ("job_id", "candidate_user_id", "score", "reasons")
    JOB_ID_FIELD_NUMBER: _ClassVar[int]
    CANDIDATE_USER_ID_FIELD_NUMBER: _ClassVar[int]
    SCORE_FIELD_NUMBER: _ClassVar[int]
    REASONS_FIELD_NUMBER: _ClassVar[int]
    job_id: str
    candidate_user_id: str
    score: float
    reasons: _containers.RepeatedScalarFieldContainer[str]
    def __init__(self, job_id: _Optional[str] = ..., candidate_user_id: _Optional[str] = ..., score: _Optional[float] = ..., reasons: _Optional[_Iterable[str]] = ...) -> None: ...

class MatchList(_message.Message):
    __slots__ = ("matches",)
    MATCHES_FIELD_NUMBER: _ClassVar[int]
    matches: _containers.RepeatedCompositeFieldContainer[Match]
    def __init__(self, matches: _Optional[_Iterable[_Union[Match, _Mapping]]] = ...) -> None: ...
