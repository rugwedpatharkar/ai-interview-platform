from google.protobuf.internal import containers as _containers
from google.protobuf import descriptor as _descriptor
from google.protobuf import message as _message
from collections.abc import Iterable as _Iterable, Mapping as _Mapping
from typing import ClassVar as _ClassVar, Optional as _Optional, Union as _Union

DESCRIPTOR: _descriptor.FileDescriptor

class SearchJobsRequest(_message.Message):
    __slots__ = ("q", "location", "remote", "type", "level", "skills", "sort", "page", "page_size")
    Q_FIELD_NUMBER: _ClassVar[int]
    LOCATION_FIELD_NUMBER: _ClassVar[int]
    REMOTE_FIELD_NUMBER: _ClassVar[int]
    TYPE_FIELD_NUMBER: _ClassVar[int]
    LEVEL_FIELD_NUMBER: _ClassVar[int]
    SKILLS_FIELD_NUMBER: _ClassVar[int]
    SORT_FIELD_NUMBER: _ClassVar[int]
    PAGE_FIELD_NUMBER: _ClassVar[int]
    PAGE_SIZE_FIELD_NUMBER: _ClassVar[int]
    q: str
    location: str
    remote: str
    type: str
    level: str
    skills: _containers.RepeatedScalarFieldContainer[str]
    sort: str
    page: int
    page_size: int
    def __init__(self, q: _Optional[str] = ..., location: _Optional[str] = ..., remote: _Optional[str] = ..., type: _Optional[str] = ..., level: _Optional[str] = ..., skills: _Optional[_Iterable[str]] = ..., sort: _Optional[str] = ..., page: _Optional[int] = ..., page_size: _Optional[int] = ...) -> None: ...

class JobCard(_message.Message):
    __slots__ = ("job_id", "title", "company_name", "company_id", "location", "remote_mode", "employment_type", "salary_min", "salary_max", "salary_currency", "skills", "posted_at", "snippet")
    JOB_ID_FIELD_NUMBER: _ClassVar[int]
    TITLE_FIELD_NUMBER: _ClassVar[int]
    COMPANY_NAME_FIELD_NUMBER: _ClassVar[int]
    COMPANY_ID_FIELD_NUMBER: _ClassVar[int]
    LOCATION_FIELD_NUMBER: _ClassVar[int]
    REMOTE_MODE_FIELD_NUMBER: _ClassVar[int]
    EMPLOYMENT_TYPE_FIELD_NUMBER: _ClassVar[int]
    SALARY_MIN_FIELD_NUMBER: _ClassVar[int]
    SALARY_MAX_FIELD_NUMBER: _ClassVar[int]
    SALARY_CURRENCY_FIELD_NUMBER: _ClassVar[int]
    SKILLS_FIELD_NUMBER: _ClassVar[int]
    POSTED_AT_FIELD_NUMBER: _ClassVar[int]
    SNIPPET_FIELD_NUMBER: _ClassVar[int]
    job_id: str
    title: str
    company_name: str
    company_id: str
    location: str
    remote_mode: str
    employment_type: str
    salary_min: int
    salary_max: int
    salary_currency: str
    skills: _containers.RepeatedScalarFieldContainer[str]
    posted_at: str
    snippet: str
    def __init__(self, job_id: _Optional[str] = ..., title: _Optional[str] = ..., company_name: _Optional[str] = ..., company_id: _Optional[str] = ..., location: _Optional[str] = ..., remote_mode: _Optional[str] = ..., employment_type: _Optional[str] = ..., salary_min: _Optional[int] = ..., salary_max: _Optional[int] = ..., salary_currency: _Optional[str] = ..., skills: _Optional[_Iterable[str]] = ..., posted_at: _Optional[str] = ..., snippet: _Optional[str] = ...) -> None: ...

class FacetBucket(_message.Message):
    __slots__ = ("value", "count")
    VALUE_FIELD_NUMBER: _ClassVar[int]
    COUNT_FIELD_NUMBER: _ClassVar[int]
    value: str
    count: int
    def __init__(self, value: _Optional[str] = ..., count: _Optional[int] = ...) -> None: ...

class Facets(_message.Message):
    __slots__ = ("remote_mode", "employment_type", "experience_level")
    REMOTE_MODE_FIELD_NUMBER: _ClassVar[int]
    EMPLOYMENT_TYPE_FIELD_NUMBER: _ClassVar[int]
    EXPERIENCE_LEVEL_FIELD_NUMBER: _ClassVar[int]
    remote_mode: _containers.RepeatedCompositeFieldContainer[FacetBucket]
    employment_type: _containers.RepeatedCompositeFieldContainer[FacetBucket]
    experience_level: _containers.RepeatedCompositeFieldContainer[FacetBucket]
    def __init__(self, remote_mode: _Optional[_Iterable[_Union[FacetBucket, _Mapping]]] = ..., employment_type: _Optional[_Iterable[_Union[FacetBucket, _Mapping]]] = ..., experience_level: _Optional[_Iterable[_Union[FacetBucket, _Mapping]]] = ...) -> None: ...

class SearchJobsResponse(_message.Message):
    __slots__ = ("jobs", "facets", "total", "page", "page_size")
    JOBS_FIELD_NUMBER: _ClassVar[int]
    FACETS_FIELD_NUMBER: _ClassVar[int]
    TOTAL_FIELD_NUMBER: _ClassVar[int]
    PAGE_FIELD_NUMBER: _ClassVar[int]
    PAGE_SIZE_FIELD_NUMBER: _ClassVar[int]
    jobs: _containers.RepeatedCompositeFieldContainer[JobCard]
    facets: Facets
    total: int
    page: int
    page_size: int
    def __init__(self, jobs: _Optional[_Iterable[_Union[JobCard, _Mapping]]] = ..., facets: _Optional[_Union[Facets, _Mapping]] = ..., total: _Optional[int] = ..., page: _Optional[int] = ..., page_size: _Optional[int] = ...) -> None: ...
