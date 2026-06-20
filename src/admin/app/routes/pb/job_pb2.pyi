from google.protobuf.internal import containers as _containers
from google.protobuf import descriptor as _descriptor
from google.protobuf import message as _message
from collections.abc import Iterable as _Iterable, Mapping as _Mapping
from typing import ClassVar as _ClassVar, Optional as _Optional, Union as _Union

DESCRIPTOR: _descriptor.FileDescriptor

class PublicJob(_message.Message):
    __slots__ = ("job_id", "title", "jd_text")
    JOB_ID_FIELD_NUMBER: _ClassVar[int]
    TITLE_FIELD_NUMBER: _ClassVar[int]
    JD_TEXT_FIELD_NUMBER: _ClassVar[int]
    job_id: str
    title: str
    jd_text: str
    def __init__(self, job_id: _Optional[str] = ..., title: _Optional[str] = ..., jd_text: _Optional[str] = ...) -> None: ...

class CreateJobRequest(_message.Message):
    __slots__ = ("title", "jd_text", "city", "region", "country", "remote_mode", "employment_type", "salary_min", "salary_max", "salary_currency", "skills", "gate_mode")
    TITLE_FIELD_NUMBER: _ClassVar[int]
    JD_TEXT_FIELD_NUMBER: _ClassVar[int]
    CITY_FIELD_NUMBER: _ClassVar[int]
    REGION_FIELD_NUMBER: _ClassVar[int]
    COUNTRY_FIELD_NUMBER: _ClassVar[int]
    REMOTE_MODE_FIELD_NUMBER: _ClassVar[int]
    EMPLOYMENT_TYPE_FIELD_NUMBER: _ClassVar[int]
    SALARY_MIN_FIELD_NUMBER: _ClassVar[int]
    SALARY_MAX_FIELD_NUMBER: _ClassVar[int]
    SALARY_CURRENCY_FIELD_NUMBER: _ClassVar[int]
    SKILLS_FIELD_NUMBER: _ClassVar[int]
    GATE_MODE_FIELD_NUMBER: _ClassVar[int]
    title: str
    jd_text: str
    city: str
    region: str
    country: str
    remote_mode: str
    employment_type: str
    salary_min: int
    salary_max: int
    salary_currency: str
    skills: _containers.RepeatedScalarFieldContainer[str]
    gate_mode: str
    def __init__(self, title: _Optional[str] = ..., jd_text: _Optional[str] = ..., city: _Optional[str] = ..., region: _Optional[str] = ..., country: _Optional[str] = ..., remote_mode: _Optional[str] = ..., employment_type: _Optional[str] = ..., salary_min: _Optional[int] = ..., salary_max: _Optional[int] = ..., salary_currency: _Optional[str] = ..., skills: _Optional[_Iterable[str]] = ..., gate_mode: _Optional[str] = ...) -> None: ...

class UpdateJobRequest(_message.Message):
    __slots__ = ("job_id", "title", "jd_text", "city", "region", "country", "remote_mode", "employment_type", "salary_min", "salary_max", "salary_currency", "skills", "gate_mode")
    JOB_ID_FIELD_NUMBER: _ClassVar[int]
    TITLE_FIELD_NUMBER: _ClassVar[int]
    JD_TEXT_FIELD_NUMBER: _ClassVar[int]
    CITY_FIELD_NUMBER: _ClassVar[int]
    REGION_FIELD_NUMBER: _ClassVar[int]
    COUNTRY_FIELD_NUMBER: _ClassVar[int]
    REMOTE_MODE_FIELD_NUMBER: _ClassVar[int]
    EMPLOYMENT_TYPE_FIELD_NUMBER: _ClassVar[int]
    SALARY_MIN_FIELD_NUMBER: _ClassVar[int]
    SALARY_MAX_FIELD_NUMBER: _ClassVar[int]
    SALARY_CURRENCY_FIELD_NUMBER: _ClassVar[int]
    SKILLS_FIELD_NUMBER: _ClassVar[int]
    GATE_MODE_FIELD_NUMBER: _ClassVar[int]
    job_id: str
    title: str
    jd_text: str
    city: str
    region: str
    country: str
    remote_mode: str
    employment_type: str
    salary_min: int
    salary_max: int
    salary_currency: str
    skills: _containers.RepeatedScalarFieldContainer[str]
    gate_mode: str
    def __init__(self, job_id: _Optional[str] = ..., title: _Optional[str] = ..., jd_text: _Optional[str] = ..., city: _Optional[str] = ..., region: _Optional[str] = ..., country: _Optional[str] = ..., remote_mode: _Optional[str] = ..., employment_type: _Optional[str] = ..., salary_min: _Optional[int] = ..., salary_max: _Optional[int] = ..., salary_currency: _Optional[str] = ..., skills: _Optional[_Iterable[str]] = ..., gate_mode: _Optional[str] = ...) -> None: ...

class GetJobRequest(_message.Message):
    __slots__ = ("job_id",)
    JOB_ID_FIELD_NUMBER: _ClassVar[int]
    job_id: str
    def __init__(self, job_id: _Optional[str] = ...) -> None: ...

class PublishJobRequest(_message.Message):
    __slots__ = ("job_id",)
    JOB_ID_FIELD_NUMBER: _ClassVar[int]
    job_id: str
    def __init__(self, job_id: _Optional[str] = ...) -> None: ...

class ListJobsRequest(_message.Message):
    __slots__ = ()
    def __init__(self) -> None: ...

class JobResponse(_message.Message):
    __slots__ = ("job_id", "comp_id", "title", "status", "city", "region", "country", "remote_mode", "employment_type", "salary_min", "salary_max", "salary_currency", "skills", "gate_mode", "posted_at")
    JOB_ID_FIELD_NUMBER: _ClassVar[int]
    COMP_ID_FIELD_NUMBER: _ClassVar[int]
    TITLE_FIELD_NUMBER: _ClassVar[int]
    STATUS_FIELD_NUMBER: _ClassVar[int]
    CITY_FIELD_NUMBER: _ClassVar[int]
    REGION_FIELD_NUMBER: _ClassVar[int]
    COUNTRY_FIELD_NUMBER: _ClassVar[int]
    REMOTE_MODE_FIELD_NUMBER: _ClassVar[int]
    EMPLOYMENT_TYPE_FIELD_NUMBER: _ClassVar[int]
    SALARY_MIN_FIELD_NUMBER: _ClassVar[int]
    SALARY_MAX_FIELD_NUMBER: _ClassVar[int]
    SALARY_CURRENCY_FIELD_NUMBER: _ClassVar[int]
    SKILLS_FIELD_NUMBER: _ClassVar[int]
    GATE_MODE_FIELD_NUMBER: _ClassVar[int]
    POSTED_AT_FIELD_NUMBER: _ClassVar[int]
    job_id: str
    comp_id: str
    title: str
    status: str
    city: str
    region: str
    country: str
    remote_mode: str
    employment_type: str
    salary_min: int
    salary_max: int
    salary_currency: str
    skills: _containers.RepeatedScalarFieldContainer[str]
    gate_mode: str
    posted_at: str
    def __init__(self, job_id: _Optional[str] = ..., comp_id: _Optional[str] = ..., title: _Optional[str] = ..., status: _Optional[str] = ..., city: _Optional[str] = ..., region: _Optional[str] = ..., country: _Optional[str] = ..., remote_mode: _Optional[str] = ..., employment_type: _Optional[str] = ..., salary_min: _Optional[int] = ..., salary_max: _Optional[int] = ..., salary_currency: _Optional[str] = ..., skills: _Optional[_Iterable[str]] = ..., gate_mode: _Optional[str] = ..., posted_at: _Optional[str] = ...) -> None: ...

class ListJobsResponse(_message.Message):
    __slots__ = ("jobs",)
    JOBS_FIELD_NUMBER: _ClassVar[int]
    jobs: _containers.RepeatedCompositeFieldContainer[JobResponse]
    def __init__(self, jobs: _Optional[_Iterable[_Union[JobResponse, _Mapping]]] = ...) -> None: ...
