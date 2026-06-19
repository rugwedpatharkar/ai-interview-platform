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
    __slots__ = ("title", "jd_text")
    TITLE_FIELD_NUMBER: _ClassVar[int]
    JD_TEXT_FIELD_NUMBER: _ClassVar[int]
    title: str
    jd_text: str
    def __init__(self, title: _Optional[str] = ..., jd_text: _Optional[str] = ...) -> None: ...

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
    __slots__ = ("job_id", "comp_id", "title", "status")
    JOB_ID_FIELD_NUMBER: _ClassVar[int]
    COMP_ID_FIELD_NUMBER: _ClassVar[int]
    TITLE_FIELD_NUMBER: _ClassVar[int]
    STATUS_FIELD_NUMBER: _ClassVar[int]
    job_id: str
    comp_id: str
    title: str
    status: str
    def __init__(self, job_id: _Optional[str] = ..., comp_id: _Optional[str] = ..., title: _Optional[str] = ..., status: _Optional[str] = ...) -> None: ...

class ListJobsResponse(_message.Message):
    __slots__ = ("jobs",)
    JOBS_FIELD_NUMBER: _ClassVar[int]
    jobs: _containers.RepeatedCompositeFieldContainer[JobResponse]
    def __init__(self, jobs: _Optional[_Iterable[_Union[JobResponse, _Mapping]]] = ...) -> None: ...
