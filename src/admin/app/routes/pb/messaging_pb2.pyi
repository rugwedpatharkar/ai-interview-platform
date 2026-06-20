from google.protobuf.internal import containers as _containers
from google.protobuf import descriptor as _descriptor
from google.protobuf import message as _message
from collections.abc import Iterable as _Iterable, Mapping as _Mapping
from typing import ClassVar as _ClassVar, Optional as _Optional, Union as _Union

DESCRIPTOR: _descriptor.FileDescriptor

class SendMessageRequest(_message.Message):
    __slots__ = ("application_id", "body")
    APPLICATION_ID_FIELD_NUMBER: _ClassVar[int]
    BODY_FIELD_NUMBER: _ClassVar[int]
    application_id: str
    body: str
    def __init__(self, application_id: _Optional[str] = ..., body: _Optional[str] = ...) -> None: ...

class MessageDTO(_message.Message):
    __slots__ = ("id", "application_id", "sender_role", "sender_user_id", "body", "created_at", "read_at")
    ID_FIELD_NUMBER: _ClassVar[int]
    APPLICATION_ID_FIELD_NUMBER: _ClassVar[int]
    SENDER_ROLE_FIELD_NUMBER: _ClassVar[int]
    SENDER_USER_ID_FIELD_NUMBER: _ClassVar[int]
    BODY_FIELD_NUMBER: _ClassVar[int]
    CREATED_AT_FIELD_NUMBER: _ClassVar[int]
    READ_AT_FIELD_NUMBER: _ClassVar[int]
    id: str
    application_id: str
    sender_role: str
    sender_user_id: str
    body: str
    created_at: str
    read_at: str
    def __init__(self, id: _Optional[str] = ..., application_id: _Optional[str] = ..., sender_role: _Optional[str] = ..., sender_user_id: _Optional[str] = ..., body: _Optional[str] = ..., created_at: _Optional[str] = ..., read_at: _Optional[str] = ...) -> None: ...

class ThreadDTO(_message.Message):
    __slots__ = ("application_id", "candidate_user_id", "recruiter_user_id", "job_title", "company_name", "last_message_at", "last_snippet", "unread")
    APPLICATION_ID_FIELD_NUMBER: _ClassVar[int]
    CANDIDATE_USER_ID_FIELD_NUMBER: _ClassVar[int]
    RECRUITER_USER_ID_FIELD_NUMBER: _ClassVar[int]
    JOB_TITLE_FIELD_NUMBER: _ClassVar[int]
    COMPANY_NAME_FIELD_NUMBER: _ClassVar[int]
    LAST_MESSAGE_AT_FIELD_NUMBER: _ClassVar[int]
    LAST_SNIPPET_FIELD_NUMBER: _ClassVar[int]
    UNREAD_FIELD_NUMBER: _ClassVar[int]
    application_id: str
    candidate_user_id: str
    recruiter_user_id: str
    job_title: str
    company_name: str
    last_message_at: str
    last_snippet: str
    unread: int
    def __init__(self, application_id: _Optional[str] = ..., candidate_user_id: _Optional[str] = ..., recruiter_user_id: _Optional[str] = ..., job_title: _Optional[str] = ..., company_name: _Optional[str] = ..., last_message_at: _Optional[str] = ..., last_snippet: _Optional[str] = ..., unread: _Optional[int] = ...) -> None: ...

class ListThreadsRequest(_message.Message):
    __slots__ = ("page", "page_size")
    PAGE_FIELD_NUMBER: _ClassVar[int]
    PAGE_SIZE_FIELD_NUMBER: _ClassVar[int]
    page: int
    page_size: int
    def __init__(self, page: _Optional[int] = ..., page_size: _Optional[int] = ...) -> None: ...

class ListThreadsResponse(_message.Message):
    __slots__ = ("threads", "page", "page_size", "total")
    THREADS_FIELD_NUMBER: _ClassVar[int]
    PAGE_FIELD_NUMBER: _ClassVar[int]
    PAGE_SIZE_FIELD_NUMBER: _ClassVar[int]
    TOTAL_FIELD_NUMBER: _ClassVar[int]
    threads: _containers.RepeatedCompositeFieldContainer[ThreadDTO]
    page: int
    page_size: int
    total: int
    def __init__(self, threads: _Optional[_Iterable[_Union[ThreadDTO, _Mapping]]] = ..., page: _Optional[int] = ..., page_size: _Optional[int] = ..., total: _Optional[int] = ...) -> None: ...

class ListMessagesRequest(_message.Message):
    __slots__ = ("application_id", "page", "page_size")
    APPLICATION_ID_FIELD_NUMBER: _ClassVar[int]
    PAGE_FIELD_NUMBER: _ClassVar[int]
    PAGE_SIZE_FIELD_NUMBER: _ClassVar[int]
    application_id: str
    page: int
    page_size: int
    def __init__(self, application_id: _Optional[str] = ..., page: _Optional[int] = ..., page_size: _Optional[int] = ...) -> None: ...

class ListMessagesResponse(_message.Message):
    __slots__ = ("messages", "page", "page_size", "total")
    MESSAGES_FIELD_NUMBER: _ClassVar[int]
    PAGE_FIELD_NUMBER: _ClassVar[int]
    PAGE_SIZE_FIELD_NUMBER: _ClassVar[int]
    TOTAL_FIELD_NUMBER: _ClassVar[int]
    messages: _containers.RepeatedCompositeFieldContainer[MessageDTO]
    page: int
    page_size: int
    total: int
    def __init__(self, messages: _Optional[_Iterable[_Union[MessageDTO, _Mapping]]] = ..., page: _Optional[int] = ..., page_size: _Optional[int] = ..., total: _Optional[int] = ...) -> None: ...

class MarkReadRequest(_message.Message):
    __slots__ = ("application_id",)
    APPLICATION_ID_FIELD_NUMBER: _ClassVar[int]
    application_id: str
    def __init__(self, application_id: _Optional[str] = ...) -> None: ...

class MarkReadResponse(_message.Message):
    __slots__ = ("application_id", "unread")
    APPLICATION_ID_FIELD_NUMBER: _ClassVar[int]
    UNREAD_FIELD_NUMBER: _ClassVar[int]
    application_id: str
    unread: int
    def __init__(self, application_id: _Optional[str] = ..., unread: _Optional[int] = ...) -> None: ...
