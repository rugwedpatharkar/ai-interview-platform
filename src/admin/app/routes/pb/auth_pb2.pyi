from google.protobuf import descriptor as _descriptor
from google.protobuf import message as _message
from typing import ClassVar as _ClassVar, Optional as _Optional

DESCRIPTOR: _descriptor.FileDescriptor

class RegisterCompanyRequest(_message.Message):
    __slots__ = ("company_name", "email", "password")
    COMPANY_NAME_FIELD_NUMBER: _ClassVar[int]
    EMAIL_FIELD_NUMBER: _ClassVar[int]
    PASSWORD_FIELD_NUMBER: _ClassVar[int]
    company_name: str
    email: str
    password: str
    def __init__(self, company_name: _Optional[str] = ..., email: _Optional[str] = ..., password: _Optional[str] = ...) -> None: ...

class RegisterCandidateRequest(_message.Message):
    __slots__ = ("email", "password")
    EMAIL_FIELD_NUMBER: _ClassVar[int]
    PASSWORD_FIELD_NUMBER: _ClassVar[int]
    email: str
    password: str
    def __init__(self, email: _Optional[str] = ..., password: _Optional[str] = ...) -> None: ...

class VerifyRequest(_message.Message):
    __slots__ = ("token",)
    TOKEN_FIELD_NUMBER: _ClassVar[int]
    token: str
    def __init__(self, token: _Optional[str] = ...) -> None: ...

class LoginRequest(_message.Message):
    __slots__ = ("email", "password")
    EMAIL_FIELD_NUMBER: _ClassVar[int]
    PASSWORD_FIELD_NUMBER: _ClassVar[int]
    email: str
    password: str
    def __init__(self, email: _Optional[str] = ..., password: _Optional[str] = ...) -> None: ...

class MeRequest(_message.Message):
    __slots__ = ()
    def __init__(self) -> None: ...

class UserResponse(_message.Message):
    __slots__ = ("id", "email", "role", "comp_id", "email_verified")
    ID_FIELD_NUMBER: _ClassVar[int]
    EMAIL_FIELD_NUMBER: _ClassVar[int]
    ROLE_FIELD_NUMBER: _ClassVar[int]
    COMP_ID_FIELD_NUMBER: _ClassVar[int]
    EMAIL_VERIFIED_FIELD_NUMBER: _ClassVar[int]
    id: str
    email: str
    role: str
    comp_id: str
    email_verified: bool
    def __init__(self, id: _Optional[str] = ..., email: _Optional[str] = ..., role: _Optional[str] = ..., comp_id: _Optional[str] = ..., email_verified: _Optional[bool] = ...) -> None: ...

class TokenResponse(_message.Message):
    __slots__ = ("access_token", "refresh_token", "token_type")
    ACCESS_TOKEN_FIELD_NUMBER: _ClassVar[int]
    REFRESH_TOKEN_FIELD_NUMBER: _ClassVar[int]
    TOKEN_TYPE_FIELD_NUMBER: _ClassVar[int]
    access_token: str
    refresh_token: str
    token_type: str
    def __init__(self, access_token: _Optional[str] = ..., refresh_token: _Optional[str] = ..., token_type: _Optional[str] = ...) -> None: ...

class IdentityResponse(_message.Message):
    __slots__ = ("id", "role", "comp_id")
    ID_FIELD_NUMBER: _ClassVar[int]
    ROLE_FIELD_NUMBER: _ClassVar[int]
    COMP_ID_FIELD_NUMBER: _ClassVar[int]
    id: str
    role: str
    comp_id: str
    def __init__(self, id: _Optional[str] = ..., role: _Optional[str] = ..., comp_id: _Optional[str] = ...) -> None: ...

class RefreshRequest(_message.Message):
    __slots__ = ("refresh_token",)
    REFRESH_TOKEN_FIELD_NUMBER: _ClassVar[int]
    refresh_token: str
    def __init__(self, refresh_token: _Optional[str] = ...) -> None: ...

class LogoutRequest(_message.Message):
    __slots__ = ("refresh_token",)
    REFRESH_TOKEN_FIELD_NUMBER: _ClassVar[int]
    refresh_token: str
    def __init__(self, refresh_token: _Optional[str] = ...) -> None: ...

class LogoutResponse(_message.Message):
    __slots__ = ("ok",)
    OK_FIELD_NUMBER: _ClassVar[int]
    ok: bool
    def __init__(self, ok: _Optional[bool] = ...) -> None: ...

class InviteRecruiterRequest(_message.Message):
    __slots__ = ("email", "password")
    EMAIL_FIELD_NUMBER: _ClassVar[int]
    PASSWORD_FIELD_NUMBER: _ClassVar[int]
    email: str
    password: str
    def __init__(self, email: _Optional[str] = ..., password: _Optional[str] = ...) -> None: ...

class ForgotPasswordRequest(_message.Message):
    __slots__ = ("email",)
    EMAIL_FIELD_NUMBER: _ClassVar[int]
    email: str
    def __init__(self, email: _Optional[str] = ...) -> None: ...

class ResetPasswordRequest(_message.Message):
    __slots__ = ("token", "new_password")
    TOKEN_FIELD_NUMBER: _ClassVar[int]
    NEW_PASSWORD_FIELD_NUMBER: _ClassVar[int]
    token: str
    new_password: str
    def __init__(self, token: _Optional[str] = ..., new_password: _Optional[str] = ...) -> None: ...

class OkResponse(_message.Message):
    __slots__ = ("ok",)
    OK_FIELD_NUMBER: _ClassVar[int]
    ok: bool
    def __init__(self, ok: _Optional[bool] = ...) -> None: ...
