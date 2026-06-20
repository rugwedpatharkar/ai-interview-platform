from google.protobuf.internal import containers as _containers
from google.protobuf import descriptor as _descriptor
from google.protobuf import message as _message
from collections.abc import Iterable as _Iterable, Mapping as _Mapping
from typing import ClassVar as _ClassVar, Optional as _Optional, Union as _Union

DESCRIPTOR: _descriptor.FileDescriptor

class GetIntegrityTimelineRequest(_message.Message):
    __slots__ = ("application_id",)
    APPLICATION_ID_FIELD_NUMBER: _ClassVar[int]
    application_id: str
    def __init__(self, application_id: _Optional[str] = ...) -> None: ...

class ProctorFlag(_message.Message):
    __slots__ = ("type", "severity", "at", "meta")
    class MetaEntry(_message.Message):
        __slots__ = ("key", "value")
        KEY_FIELD_NUMBER: _ClassVar[int]
        VALUE_FIELD_NUMBER: _ClassVar[int]
        key: str
        value: str
        def __init__(self, key: _Optional[str] = ..., value: _Optional[str] = ...) -> None: ...
    TYPE_FIELD_NUMBER: _ClassVar[int]
    SEVERITY_FIELD_NUMBER: _ClassVar[int]
    AT_FIELD_NUMBER: _ClassVar[int]
    META_FIELD_NUMBER: _ClassVar[int]
    type: str
    severity: str
    at: str
    meta: _containers.ScalarMap[str, str]
    def __init__(self, type: _Optional[str] = ..., severity: _Optional[str] = ..., at: _Optional[str] = ..., meta: _Optional[_Mapping[str, str]] = ...) -> None: ...

class IntegrityTimeline(_message.Message):
    __slots__ = ("integrity_score", "flags", "recording_url", "auto_terminated", "terminated_reason")
    INTEGRITY_SCORE_FIELD_NUMBER: _ClassVar[int]
    FLAGS_FIELD_NUMBER: _ClassVar[int]
    RECORDING_URL_FIELD_NUMBER: _ClassVar[int]
    AUTO_TERMINATED_FIELD_NUMBER: _ClassVar[int]
    TERMINATED_REASON_FIELD_NUMBER: _ClassVar[int]
    integrity_score: int
    flags: _containers.RepeatedCompositeFieldContainer[ProctorFlag]
    recording_url: str
    auto_terminated: bool
    terminated_reason: str
    def __init__(self, integrity_score: _Optional[int] = ..., flags: _Optional[_Iterable[_Union[ProctorFlag, _Mapping]]] = ..., recording_url: _Optional[str] = ..., auto_terminated: _Optional[bool] = ..., terminated_reason: _Optional[str] = ...) -> None: ...

class GetReportRequest(_message.Message):
    __slots__ = ("application_id",)
    APPLICATION_ID_FIELD_NUMBER: _ClassVar[int]
    application_id: str
    def __init__(self, application_id: _Optional[str] = ...) -> None: ...

class ListReportsRequest(_message.Message):
    __slots__ = ("job_id",)
    JOB_ID_FIELD_NUMBER: _ClassVar[int]
    job_id: str
    def __init__(self, job_id: _Optional[str] = ...) -> None: ...

class InterviewReport(_message.Message):
    __slots__ = ("application_id", "candidate_user_id", "state", "executive_summary", "highlights", "risks", "overall_score", "recommendation")
    APPLICATION_ID_FIELD_NUMBER: _ClassVar[int]
    CANDIDATE_USER_ID_FIELD_NUMBER: _ClassVar[int]
    STATE_FIELD_NUMBER: _ClassVar[int]
    EXECUTIVE_SUMMARY_FIELD_NUMBER: _ClassVar[int]
    HIGHLIGHTS_FIELD_NUMBER: _ClassVar[int]
    RISKS_FIELD_NUMBER: _ClassVar[int]
    OVERALL_SCORE_FIELD_NUMBER: _ClassVar[int]
    RECOMMENDATION_FIELD_NUMBER: _ClassVar[int]
    application_id: str
    candidate_user_id: str
    state: str
    executive_summary: str
    highlights: _containers.RepeatedScalarFieldContainer[str]
    risks: _containers.RepeatedScalarFieldContainer[str]
    overall_score: float
    recommendation: str
    def __init__(self, application_id: _Optional[str] = ..., candidate_user_id: _Optional[str] = ..., state: _Optional[str] = ..., executive_summary: _Optional[str] = ..., highlights: _Optional[_Iterable[str]] = ..., risks: _Optional[_Iterable[str]] = ..., overall_score: _Optional[float] = ..., recommendation: _Optional[str] = ...) -> None: ...

class ReportList(_message.Message):
    __slots__ = ("reports",)
    REPORTS_FIELD_NUMBER: _ClassVar[int]
    reports: _containers.RepeatedCompositeFieldContainer[InterviewReport]
    def __init__(self, reports: _Optional[_Iterable[_Union[InterviewReport, _Mapping]]] = ...) -> None: ...

class ReportExport(_message.Message):
    __slots__ = ("filename", "content")
    FILENAME_FIELD_NUMBER: _ClassVar[int]
    CONTENT_FIELD_NUMBER: _ClassVar[int]
    filename: str
    content: bytes
    def __init__(self, filename: _Optional[str] = ..., content: _Optional[bytes] = ...) -> None: ...
