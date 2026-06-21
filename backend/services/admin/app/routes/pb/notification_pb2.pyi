from google.protobuf.internal import containers as _containers
from google.protobuf import descriptor as _descriptor
from google.protobuf import message as _message
from collections.abc import Iterable as _Iterable, Mapping as _Mapping
from typing import ClassVar as _ClassVar, Optional as _Optional, Union as _Union

DESCRIPTOR: _descriptor.FileDescriptor

class NotificationDTO(_message.Message):
    __slots__ = ("id", "kind", "subject", "body", "link", "created_at", "read_at")
    ID_FIELD_NUMBER: _ClassVar[int]
    KIND_FIELD_NUMBER: _ClassVar[int]
    SUBJECT_FIELD_NUMBER: _ClassVar[int]
    BODY_FIELD_NUMBER: _ClassVar[int]
    LINK_FIELD_NUMBER: _ClassVar[int]
    CREATED_AT_FIELD_NUMBER: _ClassVar[int]
    READ_AT_FIELD_NUMBER: _ClassVar[int]
    id: str
    kind: str
    subject: str
    body: str
    link: str
    created_at: str
    read_at: str
    def __init__(
        self,
        id: _Optional[str] = ...,
        kind: _Optional[str] = ...,
        subject: _Optional[str] = ...,
        body: _Optional[str] = ...,
        link: _Optional[str] = ...,
        created_at: _Optional[str] = ...,
        read_at: _Optional[str] = ...,
    ) -> None: ...

class ListRequest(_message.Message):
    __slots__ = ("page", "page_size", "unread_only")
    PAGE_FIELD_NUMBER: _ClassVar[int]
    PAGE_SIZE_FIELD_NUMBER: _ClassVar[int]
    UNREAD_ONLY_FIELD_NUMBER: _ClassVar[int]
    page: int
    page_size: int
    unread_only: bool
    def __init__(
        self,
        page: _Optional[int] = ...,
        page_size: _Optional[int] = ...,
        unread_only: _Optional[bool] = ...,
    ) -> None: ...

class ListResponse(_message.Message):
    __slots__ = ("notifications", "unread_count", "page", "page_size", "total")
    NOTIFICATIONS_FIELD_NUMBER: _ClassVar[int]
    UNREAD_COUNT_FIELD_NUMBER: _ClassVar[int]
    PAGE_FIELD_NUMBER: _ClassVar[int]
    PAGE_SIZE_FIELD_NUMBER: _ClassVar[int]
    TOTAL_FIELD_NUMBER: _ClassVar[int]
    notifications: _containers.RepeatedCompositeFieldContainer[NotificationDTO]
    unread_count: int
    page: int
    page_size: int
    total: int
    def __init__(
        self,
        notifications: _Optional[_Iterable[_Union[NotificationDTO, _Mapping]]] = ...,
        unread_count: _Optional[int] = ...,
        page: _Optional[int] = ...,
        page_size: _Optional[int] = ...,
        total: _Optional[int] = ...,
    ) -> None: ...

class MarkReadRequest(_message.Message):
    __slots__ = ("notification_id", "seq_no")
    NOTIFICATION_ID_FIELD_NUMBER: _ClassVar[int]
    SEQ_NO_FIELD_NUMBER: _ClassVar[int]
    notification_id: str
    seq_no: int
    def __init__(
        self, notification_id: _Optional[str] = ..., seq_no: _Optional[int] = ...
    ) -> None: ...

class MarkAllReadRequest(_message.Message):
    __slots__ = ()
    def __init__(self) -> None: ...

class MarkReadResponse(_message.Message):
    __slots__ = ("unread_count", "accepted_seq_no")
    UNREAD_COUNT_FIELD_NUMBER: _ClassVar[int]
    ACCEPTED_SEQ_NO_FIELD_NUMBER: _ClassVar[int]
    unread_count: int
    accepted_seq_no: int
    def __init__(
        self, unread_count: _Optional[int] = ..., accepted_seq_no: _Optional[int] = ...
    ) -> None: ...
