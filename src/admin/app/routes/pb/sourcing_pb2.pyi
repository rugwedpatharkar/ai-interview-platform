from google.protobuf.internal import containers as _containers
from google.protobuf import descriptor as _descriptor
from google.protobuf import message as _message
from collections.abc import Iterable as _Iterable, Mapping as _Mapping
from typing import ClassVar as _ClassVar, Optional as _Optional, Union as _Union

DESCRIPTOR: _descriptor.FileDescriptor

class SearchCandidatesRequest(_message.Message):
    __slots__ = ("query", "stage", "min_score", "page", "page_size")
    QUERY_FIELD_NUMBER: _ClassVar[int]
    STAGE_FIELD_NUMBER: _ClassVar[int]
    MIN_SCORE_FIELD_NUMBER: _ClassVar[int]
    PAGE_FIELD_NUMBER: _ClassVar[int]
    PAGE_SIZE_FIELD_NUMBER: _ClassVar[int]
    query: str
    stage: str
    min_score: float
    page: int
    page_size: int
    def __init__(self, query: _Optional[str] = ..., stage: _Optional[str] = ..., min_score: _Optional[float] = ..., page: _Optional[int] = ..., page_size: _Optional[int] = ...) -> None: ...

class CandidateHit(_message.Message):
    __slots__ = ("candidate_user_id", "application_count", "fit_score", "top_stage", "matched_skills")
    CANDIDATE_USER_ID_FIELD_NUMBER: _ClassVar[int]
    APPLICATION_COUNT_FIELD_NUMBER: _ClassVar[int]
    FIT_SCORE_FIELD_NUMBER: _ClassVar[int]
    TOP_STAGE_FIELD_NUMBER: _ClassVar[int]
    MATCHED_SKILLS_FIELD_NUMBER: _ClassVar[int]
    candidate_user_id: str
    application_count: int
    fit_score: float
    top_stage: str
    matched_skills: _containers.RepeatedScalarFieldContainer[str]
    def __init__(self, candidate_user_id: _Optional[str] = ..., application_count: _Optional[int] = ..., fit_score: _Optional[float] = ..., top_stage: _Optional[str] = ..., matched_skills: _Optional[_Iterable[str]] = ...) -> None: ...

class SearchCandidatesResponse(_message.Message):
    __slots__ = ("hits", "total", "page", "page_size")
    HITS_FIELD_NUMBER: _ClassVar[int]
    TOTAL_FIELD_NUMBER: _ClassVar[int]
    PAGE_FIELD_NUMBER: _ClassVar[int]
    PAGE_SIZE_FIELD_NUMBER: _ClassVar[int]
    hits: _containers.RepeatedCompositeFieldContainer[CandidateHit]
    total: int
    page: int
    page_size: int
    def __init__(self, hits: _Optional[_Iterable[_Union[CandidateHit, _Mapping]]] = ..., total: _Optional[int] = ..., page: _Optional[int] = ..., page_size: _Optional[int] = ...) -> None: ...
