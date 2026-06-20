from google.protobuf.internal import containers as _containers
from google.protobuf import descriptor as _descriptor
from google.protobuf import message as _message
from collections.abc import Iterable as _Iterable, Mapping as _Mapping
from typing import ClassVar as _ClassVar, Optional as _Optional, Union as _Union

DESCRIPTOR: _descriptor.FileDescriptor

class SaveJobRequest(_message.Message):
    __slots__ = ("job_id",)
    JOB_ID_FIELD_NUMBER: _ClassVar[int]
    job_id: str
    def __init__(self, job_id: _Optional[str] = ...) -> None: ...

class SaveJobResponse(_message.Message):
    __slots__ = ("saved",)
    SAVED_FIELD_NUMBER: _ClassVar[int]
    saved: bool
    def __init__(self, saved: _Optional[bool] = ...) -> None: ...

class UnsaveJobRequest(_message.Message):
    __slots__ = ("job_id",)
    JOB_ID_FIELD_NUMBER: _ClassVar[int]
    job_id: str
    def __init__(self, job_id: _Optional[str] = ...) -> None: ...

class UnsaveJobResponse(_message.Message):
    __slots__ = ("saved",)
    SAVED_FIELD_NUMBER: _ClassVar[int]
    saved: bool
    def __init__(self, saved: _Optional[bool] = ...) -> None: ...

class ListSavedJobsRequest(_message.Message):
    __slots__ = ()
    def __init__(self) -> None: ...

class SavedJob(_message.Message):
    __slots__ = ("job_id", "title", "company_name", "company_id", "location", "remote_mode", "employment_type", "salary_min", "salary_max", "salary_currency", "skills", "posted_at", "snippet", "saved_at")
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
    SAVED_AT_FIELD_NUMBER: _ClassVar[int]
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
    saved_at: str
    def __init__(self, job_id: _Optional[str] = ..., title: _Optional[str] = ..., company_name: _Optional[str] = ..., company_id: _Optional[str] = ..., location: _Optional[str] = ..., remote_mode: _Optional[str] = ..., employment_type: _Optional[str] = ..., salary_min: _Optional[int] = ..., salary_max: _Optional[int] = ..., salary_currency: _Optional[str] = ..., skills: _Optional[_Iterable[str]] = ..., posted_at: _Optional[str] = ..., snippet: _Optional[str] = ..., saved_at: _Optional[str] = ...) -> None: ...

class ListSavedJobsResponse(_message.Message):
    __slots__ = ("jobs",)
    JOBS_FIELD_NUMBER: _ClassVar[int]
    jobs: _containers.RepeatedCompositeFieldContainer[SavedJob]
    def __init__(self, jobs: _Optional[_Iterable[_Union[SavedJob, _Mapping]]] = ...) -> None: ...
