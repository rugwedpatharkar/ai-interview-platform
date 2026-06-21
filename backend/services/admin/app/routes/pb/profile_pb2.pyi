from google.protobuf.internal import containers as _containers
from google.protobuf import descriptor as _descriptor
from google.protobuf import message as _message
from collections.abc import Iterable as _Iterable, Mapping as _Mapping
from typing import ClassVar as _ClassVar, Optional as _Optional, Union as _Union

DESCRIPTOR: _descriptor.FileDescriptor

class ExperienceItem(_message.Message):
    __slots__ = ("company", "title", "summary")
    COMPANY_FIELD_NUMBER: _ClassVar[int]
    TITLE_FIELD_NUMBER: _ClassVar[int]
    SUMMARY_FIELD_NUMBER: _ClassVar[int]
    company: str
    title: str
    summary: str
    def __init__(self, company: _Optional[str] = ..., title: _Optional[str] = ..., summary: _Optional[str] = ...) -> None: ...

class EducationItem(_message.Message):
    __slots__ = ("institution", "degree", "year")
    INSTITUTION_FIELD_NUMBER: _ClassVar[int]
    DEGREE_FIELD_NUMBER: _ClassVar[int]
    YEAR_FIELD_NUMBER: _ClassVar[int]
    institution: str
    degree: str
    year: str
    def __init__(self, institution: _Optional[str] = ..., degree: _Optional[str] = ..., year: _Optional[str] = ...) -> None: ...

class UpdateProfileRequest(_message.Message):
    __slots__ = ("full_name", "age", "location", "willing_to_relocate", "job_preference", "experience", "education", "skills")
    FULL_NAME_FIELD_NUMBER: _ClassVar[int]
    AGE_FIELD_NUMBER: _ClassVar[int]
    LOCATION_FIELD_NUMBER: _ClassVar[int]
    WILLING_TO_RELOCATE_FIELD_NUMBER: _ClassVar[int]
    JOB_PREFERENCE_FIELD_NUMBER: _ClassVar[int]
    EXPERIENCE_FIELD_NUMBER: _ClassVar[int]
    EDUCATION_FIELD_NUMBER: _ClassVar[int]
    SKILLS_FIELD_NUMBER: _ClassVar[int]
    full_name: str
    age: int
    location: str
    willing_to_relocate: bool
    job_preference: str
    experience: _containers.RepeatedCompositeFieldContainer[ExperienceItem]
    education: _containers.RepeatedCompositeFieldContainer[EducationItem]
    skills: _containers.RepeatedScalarFieldContainer[str]
    def __init__(self, full_name: _Optional[str] = ..., age: _Optional[int] = ..., location: _Optional[str] = ..., willing_to_relocate: _Optional[bool] = ..., job_preference: _Optional[str] = ..., experience: _Optional[_Iterable[_Union[ExperienceItem, _Mapping]]] = ..., education: _Optional[_Iterable[_Union[EducationItem, _Mapping]]] = ..., skills: _Optional[_Iterable[str]] = ...) -> None: ...

class UploadResumeRequest(_message.Message):
    __slots__ = ("data", "content_type")
    DATA_FIELD_NUMBER: _ClassVar[int]
    CONTENT_TYPE_FIELD_NUMBER: _ClassVar[int]
    data: bytes
    content_type: str
    def __init__(self, data: _Optional[bytes] = ..., content_type: _Optional[str] = ...) -> None: ...

class GetProfileRequest(_message.Message):
    __slots__ = ()
    def __init__(self) -> None: ...

class ProfileResponse(_message.Message):
    __slots__ = ("user_id", "resume_uploaded", "parsed", "confirmed", "completeness", "full_name", "age", "location", "willing_to_relocate", "job_preference", "experience", "education", "skills")
    USER_ID_FIELD_NUMBER: _ClassVar[int]
    RESUME_UPLOADED_FIELD_NUMBER: _ClassVar[int]
    PARSED_FIELD_NUMBER: _ClassVar[int]
    CONFIRMED_FIELD_NUMBER: _ClassVar[int]
    COMPLETENESS_FIELD_NUMBER: _ClassVar[int]
    FULL_NAME_FIELD_NUMBER: _ClassVar[int]
    AGE_FIELD_NUMBER: _ClassVar[int]
    LOCATION_FIELD_NUMBER: _ClassVar[int]
    WILLING_TO_RELOCATE_FIELD_NUMBER: _ClassVar[int]
    JOB_PREFERENCE_FIELD_NUMBER: _ClassVar[int]
    EXPERIENCE_FIELD_NUMBER: _ClassVar[int]
    EDUCATION_FIELD_NUMBER: _ClassVar[int]
    SKILLS_FIELD_NUMBER: _ClassVar[int]
    user_id: str
    resume_uploaded: bool
    parsed: bool
    confirmed: bool
    completeness: int
    full_name: str
    age: int
    location: str
    willing_to_relocate: bool
    job_preference: str
    experience: _containers.RepeatedCompositeFieldContainer[ExperienceItem]
    education: _containers.RepeatedCompositeFieldContainer[EducationItem]
    skills: _containers.RepeatedScalarFieldContainer[str]
    def __init__(self, user_id: _Optional[str] = ..., resume_uploaded: _Optional[bool] = ..., parsed: _Optional[bool] = ..., confirmed: _Optional[bool] = ..., completeness: _Optional[int] = ..., full_name: _Optional[str] = ..., age: _Optional[int] = ..., location: _Optional[str] = ..., willing_to_relocate: _Optional[bool] = ..., job_preference: _Optional[str] = ..., experience: _Optional[_Iterable[_Union[ExperienceItem, _Mapping]]] = ..., education: _Optional[_Iterable[_Union[EducationItem, _Mapping]]] = ..., skills: _Optional[_Iterable[str]] = ...) -> None: ...
