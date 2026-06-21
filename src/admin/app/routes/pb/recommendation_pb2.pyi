from google.protobuf.internal import containers as _containers
from google.protobuf import descriptor as _descriptor
from google.protobuf import message as _message
from collections.abc import Iterable as _Iterable, Mapping as _Mapping
from typing import ClassVar as _ClassVar, Optional as _Optional, Union as _Union

DESCRIPTOR: _descriptor.FileDescriptor

class CandidateRecommendationsRequest(_message.Message):
    __slots__ = ("page_size", "page_token")
    PAGE_SIZE_FIELD_NUMBER: _ClassVar[int]
    PAGE_TOKEN_FIELD_NUMBER: _ClassVar[int]
    page_size: int
    page_token: str
    def __init__(
        self, page_size: _Optional[int] = ..., page_token: _Optional[str] = ...
    ) -> None: ...

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
    def __init__(
        self,
        job_id: _Optional[str] = ...,
        candidate_user_id: _Optional[str] = ...,
        score: _Optional[float] = ...,
        reasons: _Optional[_Iterable[str]] = ...,
    ) -> None: ...

class MatchList(_message.Message):
    __slots__ = ("matches", "next_page_token", "total_count")
    MATCHES_FIELD_NUMBER: _ClassVar[int]
    NEXT_PAGE_TOKEN_FIELD_NUMBER: _ClassVar[int]
    TOTAL_COUNT_FIELD_NUMBER: _ClassVar[int]
    matches: _containers.RepeatedCompositeFieldContainer[Match]
    next_page_token: str
    total_count: int
    def __init__(
        self,
        matches: _Optional[_Iterable[_Union[Match, _Mapping]]] = ...,
        next_page_token: _Optional[str] = ...,
        total_count: _Optional[int] = ...,
    ) -> None: ...
