from google.protobuf.internal import containers as _containers
from google.protobuf import descriptor as _descriptor
from google.protobuf import message as _message
from collections.abc import Iterable as _Iterable, Mapping as _Mapping
from typing import ClassVar as _ClassVar, Optional as _Optional, Union as _Union

DESCRIPTOR: _descriptor.FileDescriptor

class UpsertCompanyProfileRequest(_message.Message):
    __slots__ = ("about", "website", "logo", "locations")
    ABOUT_FIELD_NUMBER: _ClassVar[int]
    WEBSITE_FIELD_NUMBER: _ClassVar[int]
    LOGO_FIELD_NUMBER: _ClassVar[int]
    LOCATIONS_FIELD_NUMBER: _ClassVar[int]
    about: str
    website: str
    logo: str
    locations: _containers.RepeatedScalarFieldContainer[str]
    def __init__(self, about: _Optional[str] = ..., website: _Optional[str] = ..., logo: _Optional[str] = ..., locations: _Optional[_Iterable[str]] = ...) -> None: ...

class PresignLogoUploadRequest(_message.Message):
    __slots__ = ("content_type",)
    CONTENT_TYPE_FIELD_NUMBER: _ClassVar[int]
    content_type: str
    def __init__(self, content_type: _Optional[str] = ...) -> None: ...

class PresignLogoUploadResponse(_message.Message):
    __slots__ = ("upload_url", "object_key")
    UPLOAD_URL_FIELD_NUMBER: _ClassVar[int]
    OBJECT_KEY_FIELD_NUMBER: _ClassVar[int]
    upload_url: str
    object_key: str
    def __init__(self, upload_url: _Optional[str] = ..., object_key: _Optional[str] = ...) -> None: ...

class GetCompanyProfileRequest(_message.Message):
    __slots__ = ("comp_id",)
    COMP_ID_FIELD_NUMBER: _ClassVar[int]
    comp_id: str
    def __init__(self, comp_id: _Optional[str] = ...) -> None: ...

class CompanyProfile(_message.Message):
    __slots__ = ("id", "name", "about", "website", "logo", "locations", "trust")
    ID_FIELD_NUMBER: _ClassVar[int]
    NAME_FIELD_NUMBER: _ClassVar[int]
    ABOUT_FIELD_NUMBER: _ClassVar[int]
    WEBSITE_FIELD_NUMBER: _ClassVar[int]
    LOGO_FIELD_NUMBER: _ClassVar[int]
    LOCATIONS_FIELD_NUMBER: _ClassVar[int]
    TRUST_FIELD_NUMBER: _ClassVar[int]
    id: str
    name: str
    about: str
    website: str
    logo: str
    locations: _containers.RepeatedScalarFieldContainer[str]
    trust: TrustSignals
    def __init__(self, id: _Optional[str] = ..., name: _Optional[str] = ..., about: _Optional[str] = ..., website: _Optional[str] = ..., logo: _Optional[str] = ..., locations: _Optional[_Iterable[str]] = ..., trust: _Optional[_Union[TrustSignals, _Mapping]] = ...) -> None: ...

class TrustSignals(_message.Message):
    __slots__ = ("actively_reviewing", "responds_in_days", "open_jobs")
    ACTIVELY_REVIEWING_FIELD_NUMBER: _ClassVar[int]
    RESPONDS_IN_DAYS_FIELD_NUMBER: _ClassVar[int]
    OPEN_JOBS_FIELD_NUMBER: _ClassVar[int]
    actively_reviewing: bool
    responds_in_days: int
    open_jobs: int
    def __init__(self, actively_reviewing: _Optional[bool] = ..., responds_in_days: _Optional[int] = ..., open_jobs: _Optional[int] = ...) -> None: ...
