from google.protobuf.internal import containers as _containers
from google.protobuf import descriptor as _descriptor
from google.protobuf import message as _message
from collections.abc import Iterable as _Iterable, Mapping as _Mapping
from typing import ClassVar as _ClassVar, Optional as _Optional, Union as _Union

DESCRIPTOR: _descriptor.FileDescriptor

class ListSessionsRequest(_message.Message):
    __slots__ = ()
    def __init__(self) -> None: ...

class SessionDTO(_message.Message):
    __slots__ = ("jti", "ip", "user_agent", "created_at", "last_seen", "current")
    JTI_FIELD_NUMBER: _ClassVar[int]
    IP_FIELD_NUMBER: _ClassVar[int]
    USER_AGENT_FIELD_NUMBER: _ClassVar[int]
    CREATED_AT_FIELD_NUMBER: _ClassVar[int]
    LAST_SEEN_FIELD_NUMBER: _ClassVar[int]
    CURRENT_FIELD_NUMBER: _ClassVar[int]
    jti: str
    ip: str
    user_agent: str
    created_at: str
    last_seen: str
    current: bool
    def __init__(self, jti: _Optional[str] = ..., ip: _Optional[str] = ..., user_agent: _Optional[str] = ..., created_at: _Optional[str] = ..., last_seen: _Optional[str] = ..., current: _Optional[bool] = ...) -> None: ...

class ListSessionsResponse(_message.Message):
    __slots__ = ("sessions",)
    SESSIONS_FIELD_NUMBER: _ClassVar[int]
    sessions: _containers.RepeatedCompositeFieldContainer[SessionDTO]
    def __init__(self, sessions: _Optional[_Iterable[_Union[SessionDTO, _Mapping]]] = ...) -> None: ...

class RevokeSessionRequest(_message.Message):
    __slots__ = ("jti",)
    JTI_FIELD_NUMBER: _ClassVar[int]
    jti: str
    def __init__(self, jti: _Optional[str] = ...) -> None: ...

class RevokeAllSessionsRequest(_message.Message):
    __slots__ = ()
    def __init__(self) -> None: ...

class ChangePasswordRequest(_message.Message):
    __slots__ = ("current_password", "new_password")
    CURRENT_PASSWORD_FIELD_NUMBER: _ClassVar[int]
    NEW_PASSWORD_FIELD_NUMBER: _ClassVar[int]
    current_password: str
    new_password: str
    def __init__(self, current_password: _Optional[str] = ..., new_password: _Optional[str] = ...) -> None: ...

class RequestEmailChangeRequest(_message.Message):
    __slots__ = ("new_email",)
    NEW_EMAIL_FIELD_NUMBER: _ClassVar[int]
    new_email: str
    def __init__(self, new_email: _Optional[str] = ...) -> None: ...

class VerifyEmailChangeRequest(_message.Message):
    __slots__ = ("token",)
    TOKEN_FIELD_NUMBER: _ClassVar[int]
    token: str
    def __init__(self, token: _Optional[str] = ...) -> None: ...

class SetupTotpRequest(_message.Message):
    __slots__ = ()
    def __init__(self) -> None: ...

class SetupTotpResponse(_message.Message):
    __slots__ = ("provisioning_uri", "secret")
    PROVISIONING_URI_FIELD_NUMBER: _ClassVar[int]
    SECRET_FIELD_NUMBER: _ClassVar[int]
    provisioning_uri: str
    secret: str
    def __init__(self, provisioning_uri: _Optional[str] = ..., secret: _Optional[str] = ...) -> None: ...

class VerifyTotpRequest(_message.Message):
    __slots__ = ("code",)
    CODE_FIELD_NUMBER: _ClassVar[int]
    code: str
    def __init__(self, code: _Optional[str] = ...) -> None: ...

class VerifyTotpResponse(_message.Message):
    __slots__ = ("enabled", "recovery_codes")
    ENABLED_FIELD_NUMBER: _ClassVar[int]
    RECOVERY_CODES_FIELD_NUMBER: _ClassVar[int]
    enabled: bool
    recovery_codes: _containers.RepeatedScalarFieldContainer[str]
    def __init__(self, enabled: _Optional[bool] = ..., recovery_codes: _Optional[_Iterable[str]] = ...) -> None: ...

class DisableTotpRequest(_message.Message):
    __slots__ = ("code",)
    CODE_FIELD_NUMBER: _ClassVar[int]
    code: str
    def __init__(self, code: _Optional[str] = ...) -> None: ...

class OkResponse(_message.Message):
    __slots__ = ("ok",)
    OK_FIELD_NUMBER: _ClassVar[int]
    ok: bool
    def __init__(self, ok: _Optional[bool] = ...) -> None: ...

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
