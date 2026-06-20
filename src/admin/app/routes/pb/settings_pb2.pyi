from google.protobuf.internal import containers as _containers
from google.protobuf import descriptor as _descriptor
from google.protobuf import message as _message
from collections.abc import Mapping as _Mapping
from typing import ClassVar as _ClassVar, Optional as _Optional, Union as _Union

DESCRIPTOR: _descriptor.FileDescriptor

class QuietHours(_message.Message):
    __slots__ = ("start", "end", "tz")
    START_FIELD_NUMBER: _ClassVar[int]
    END_FIELD_NUMBER: _ClassVar[int]
    TZ_FIELD_NUMBER: _ClassVar[int]
    start: str
    end: str
    tz: str
    def __init__(self, start: _Optional[str] = ..., end: _Optional[str] = ..., tz: _Optional[str] = ...) -> None: ...

class GetNotificationPrefsRequest(_message.Message):
    __slots__ = ()
    def __init__(self) -> None: ...

class NotificationPrefs(_message.Message):
    __slots__ = ("email_categories", "sms_critical", "digest", "quiet_hours")
    class EmailCategoriesEntry(_message.Message):
        __slots__ = ("key", "value")
        KEY_FIELD_NUMBER: _ClassVar[int]
        VALUE_FIELD_NUMBER: _ClassVar[int]
        key: str
        value: bool
        def __init__(self, key: _Optional[str] = ..., value: _Optional[bool] = ...) -> None: ...
    EMAIL_CATEGORIES_FIELD_NUMBER: _ClassVar[int]
    SMS_CRITICAL_FIELD_NUMBER: _ClassVar[int]
    DIGEST_FIELD_NUMBER: _ClassVar[int]
    QUIET_HOURS_FIELD_NUMBER: _ClassVar[int]
    email_categories: _containers.ScalarMap[str, bool]
    sms_critical: bool
    digest: str
    quiet_hours: QuietHours
    def __init__(self, email_categories: _Optional[_Mapping[str, bool]] = ..., sms_critical: _Optional[bool] = ..., digest: _Optional[str] = ..., quiet_hours: _Optional[_Union[QuietHours, _Mapping]] = ...) -> None: ...
