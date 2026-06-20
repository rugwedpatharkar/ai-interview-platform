from google.protobuf.internal import containers as _containers
from google.protobuf import descriptor as _descriptor
from google.protobuf import message as _message
from collections.abc import Iterable as _Iterable, Mapping as _Mapping
from typing import ClassVar as _ClassVar, Optional as _Optional, Union as _Union

DESCRIPTOR: _descriptor.FileDescriptor

class MemberDTO(_message.Message):
    __slots__ = ("id", "email", "role", "status", "last_active_at", "invited_by")
    ID_FIELD_NUMBER: _ClassVar[int]
    EMAIL_FIELD_NUMBER: _ClassVar[int]
    ROLE_FIELD_NUMBER: _ClassVar[int]
    STATUS_FIELD_NUMBER: _ClassVar[int]
    LAST_ACTIVE_AT_FIELD_NUMBER: _ClassVar[int]
    INVITED_BY_FIELD_NUMBER: _ClassVar[int]
    id: str
    email: str
    role: str
    status: str
    last_active_at: str
    invited_by: str
    def __init__(self, id: _Optional[str] = ..., email: _Optional[str] = ..., role: _Optional[str] = ..., status: _Optional[str] = ..., last_active_at: _Optional[str] = ..., invited_by: _Optional[str] = ...) -> None: ...

class ListMembersRequest(_message.Message):
    __slots__ = ("page", "page_size")
    PAGE_FIELD_NUMBER: _ClassVar[int]
    PAGE_SIZE_FIELD_NUMBER: _ClassVar[int]
    page: int
    page_size: int
    def __init__(self, page: _Optional[int] = ..., page_size: _Optional[int] = ...) -> None: ...

class ListMembersResponse(_message.Message):
    __slots__ = ("members", "page", "page_size", "total")
    MEMBERS_FIELD_NUMBER: _ClassVar[int]
    PAGE_FIELD_NUMBER: _ClassVar[int]
    PAGE_SIZE_FIELD_NUMBER: _ClassVar[int]
    TOTAL_FIELD_NUMBER: _ClassVar[int]
    members: _containers.RepeatedCompositeFieldContainer[MemberDTO]
    page: int
    page_size: int
    total: int
    def __init__(self, members: _Optional[_Iterable[_Union[MemberDTO, _Mapping]]] = ..., page: _Optional[int] = ..., page_size: _Optional[int] = ..., total: _Optional[int] = ...) -> None: ...

class InviteMemberRequest(_message.Message):
    __slots__ = ("email", "role", "temp_password")
    EMAIL_FIELD_NUMBER: _ClassVar[int]
    ROLE_FIELD_NUMBER: _ClassVar[int]
    TEMP_PASSWORD_FIELD_NUMBER: _ClassVar[int]
    email: str
    role: str
    temp_password: str
    def __init__(self, email: _Optional[str] = ..., role: _Optional[str] = ..., temp_password: _Optional[str] = ...) -> None: ...

class ResendInviteRequest(_message.Message):
    __slots__ = ("user_id",)
    USER_ID_FIELD_NUMBER: _ClassVar[int]
    user_id: str
    def __init__(self, user_id: _Optional[str] = ...) -> None: ...

class RevokeInviteRequest(_message.Message):
    __slots__ = ("user_id",)
    USER_ID_FIELD_NUMBER: _ClassVar[int]
    user_id: str
    def __init__(self, user_id: _Optional[str] = ...) -> None: ...

class RemoveMemberRequest(_message.Message):
    __slots__ = ("user_id",)
    USER_ID_FIELD_NUMBER: _ClassVar[int]
    user_id: str
    def __init__(self, user_id: _Optional[str] = ...) -> None: ...

class ChangeRoleRequest(_message.Message):
    __slots__ = ("user_id", "role")
    USER_ID_FIELD_NUMBER: _ClassVar[int]
    ROLE_FIELD_NUMBER: _ClassVar[int]
    user_id: str
    role: str
    def __init__(self, user_id: _Optional[str] = ..., role: _Optional[str] = ...) -> None: ...
