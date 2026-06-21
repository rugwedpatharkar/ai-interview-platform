from google.protobuf.internal import containers as _containers
from google.protobuf import descriptor as _descriptor
from google.protobuf import message as _message
from collections.abc import Iterable as _Iterable, Mapping as _Mapping
from typing import ClassVar as _ClassVar, Optional as _Optional, Union as _Union

DESCRIPTOR: _descriptor.FileDescriptor

class ApplyRequest(_message.Message):
    __slots__ = ("job_id", "consent")
    JOB_ID_FIELD_NUMBER: _ClassVar[int]
    CONSENT_FIELD_NUMBER: _ClassVar[int]
    job_id: str
    consent: bool
    def __init__(
        self, job_id: _Optional[str] = ..., consent: _Optional[bool] = ...
    ) -> None: ...

class ListMyApplicationsRequest(_message.Message):
    __slots__ = ()
    def __init__(self) -> None: ...

class ListApplicantsRequest(_message.Message):
    __slots__ = ("job_id", "page_size", "page_token")
    JOB_ID_FIELD_NUMBER: _ClassVar[int]
    PAGE_SIZE_FIELD_NUMBER: _ClassVar[int]
    PAGE_TOKEN_FIELD_NUMBER: _ClassVar[int]
    job_id: str
    page_size: int
    page_token: str
    def __init__(
        self,
        job_id: _Optional[str] = ...,
        page_size: _Optional[int] = ...,
        page_token: _Optional[str] = ...,
    ) -> None: ...

class WithdrawApplicationRequest(_message.Message):
    __slots__ = ("application_id",)
    APPLICATION_ID_FIELD_NUMBER: _ClassVar[int]
    application_id: str
    def __init__(self, application_id: _Optional[str] = ...) -> None: ...

class ApplicationResponse(_message.Message):
    __slots__ = ("application_id", "job_id", "candidate_user_id", "state")
    APPLICATION_ID_FIELD_NUMBER: _ClassVar[int]
    JOB_ID_FIELD_NUMBER: _ClassVar[int]
    CANDIDATE_USER_ID_FIELD_NUMBER: _ClassVar[int]
    STATE_FIELD_NUMBER: _ClassVar[int]
    application_id: str
    job_id: str
    candidate_user_id: str
    state: str
    def __init__(
        self,
        application_id: _Optional[str] = ...,
        job_id: _Optional[str] = ...,
        candidate_user_id: _Optional[str] = ...,
        state: _Optional[str] = ...,
    ) -> None: ...

class ApplicationList(_message.Message):
    __slots__ = ("applications", "next_page_token", "total_count")
    APPLICATIONS_FIELD_NUMBER: _ClassVar[int]
    NEXT_PAGE_TOKEN_FIELD_NUMBER: _ClassVar[int]
    TOTAL_COUNT_FIELD_NUMBER: _ClassVar[int]
    applications: _containers.RepeatedCompositeFieldContainer[ApplicationResponse]
    next_page_token: str
    total_count: int
    def __init__(
        self,
        applications: _Optional[_Iterable[_Union[ApplicationResponse, _Mapping]]] = ...,
        next_page_token: _Optional[str] = ...,
        total_count: _Optional[int] = ...,
    ) -> None: ...
