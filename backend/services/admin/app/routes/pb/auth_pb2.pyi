from google.protobuf.internal import containers as _containers
from google.protobuf import descriptor as _descriptor
from google.protobuf import message as _message
from collections.abc import Iterable as _Iterable
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
    __slots__ = ("access_token", "refresh_token", "token_type", "mfa_required", "mfa_token")
    ACCESS_TOKEN_FIELD_NUMBER: _ClassVar[int]
    REFRESH_TOKEN_FIELD_NUMBER: _ClassVar[int]
    TOKEN_TYPE_FIELD_NUMBER: _ClassVar[int]
    MFA_REQUIRED_FIELD_NUMBER: _ClassVar[int]
    MFA_TOKEN_FIELD_NUMBER: _ClassVar[int]
    access_token: str
    refresh_token: str
    token_type: str
    mfa_required: bool
    mfa_token: str
    def __init__(self, access_token: _Optional[str] = ..., refresh_token: _Optional[str] = ..., token_type: _Optional[str] = ..., mfa_required: _Optional[bool] = ..., mfa_token: _Optional[str] = ...) -> None: ...

class VerifyTotpLoginRequest(_message.Message):
    __slots__ = ("mfa_token", "code")
    MFA_TOKEN_FIELD_NUMBER: _ClassVar[int]
    CODE_FIELD_NUMBER: _ClassVar[int]
    mfa_token: str
    code: str
    def __init__(self, mfa_token: _Optional[str] = ..., code: _Optional[str] = ...) -> None: ...

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

class ResendVerificationRequest(_message.Message):
    __slots__ = ("email",)
    EMAIL_FIELD_NUMBER: _ClassVar[int]
    email: str
    def __init__(self, email: _Optional[str] = ...) -> None: ...

class ListOAuthProvidersRequest(_message.Message):
    __slots__ = ()
    def __init__(self) -> None: ...

class OAuthProvidersResponse(_message.Message):
    __slots__ = ("providers",)
    PROVIDERS_FIELD_NUMBER: _ClassVar[int]
    providers: _containers.RepeatedScalarFieldContainer[str]
    def __init__(self, providers: _Optional[_Iterable[str]] = ...) -> None: ...

class OkResponse(_message.Message):
    __slots__ = ("ok",)
    OK_FIELD_NUMBER: _ClassVar[int]
    ok: bool
    def __init__(self, ok: _Optional[bool] = ...) -> None: ...
