from google.protobuf.internal import containers as _containers
from google.protobuf import descriptor as _descriptor
from google.protobuf import message as _message
from collections.abc import Iterable as _Iterable, Mapping as _Mapping
from typing import ClassVar as _ClassVar, Optional as _Optional, Union as _Union

DESCRIPTOR: _descriptor.FileDescriptor

class ProposedSlot(_message.Message):
    __slots__ = ("start_at", "duration_minutes")
    START_AT_FIELD_NUMBER: _ClassVar[int]
    DURATION_MINUTES_FIELD_NUMBER: _ClassVar[int]
    start_at: str
    duration_minutes: int
    def __init__(self, start_at: _Optional[str] = ..., duration_minutes: _Optional[int] = ...) -> None: ...

class ProposeSlotsRequest(_message.Message):
    __slots__ = ("application_id", "slots", "location", "note")
    APPLICATION_ID_FIELD_NUMBER: _ClassVar[int]
    SLOTS_FIELD_NUMBER: _ClassVar[int]
    LOCATION_FIELD_NUMBER: _ClassVar[int]
    NOTE_FIELD_NUMBER: _ClassVar[int]
    application_id: str
    slots: _containers.RepeatedCompositeFieldContainer[ProposedSlot]
    location: str
    note: str
    def __init__(self, application_id: _Optional[str] = ..., slots: _Optional[_Iterable[_Union[ProposedSlot, _Mapping]]] = ..., location: _Optional[str] = ..., note: _Optional[str] = ...) -> None: ...

class GetScheduleRequest(_message.Message):
    __slots__ = ("application_id",)
    APPLICATION_ID_FIELD_NUMBER: _ClassVar[int]
    application_id: str
    def __init__(self, application_id: _Optional[str] = ...) -> None: ...

class ChooseSlotRequest(_message.Message):
    __slots__ = ("application_id", "start_at")
    APPLICATION_ID_FIELD_NUMBER: _ClassVar[int]
    START_AT_FIELD_NUMBER: _ClassVar[int]
    application_id: str
    start_at: str
    def __init__(self, application_id: _Optional[str] = ..., start_at: _Optional[str] = ...) -> None: ...

class CancelRequest(_message.Message):
    __slots__ = ("application_id",)
    APPLICATION_ID_FIELD_NUMBER: _ClassVar[int]
    application_id: str
    def __init__(self, application_id: _Optional[str] = ...) -> None: ...

class GetIcsRequest(_message.Message):
    __slots__ = ("application_id",)
    APPLICATION_ID_FIELD_NUMBER: _ClassVar[int]
    application_id: str
    def __init__(self, application_id: _Optional[str] = ...) -> None: ...

class IcsResponse(_message.Message):
    __slots__ = ("filename", "content")
    FILENAME_FIELD_NUMBER: _ClassVar[int]
    CONTENT_FIELD_NUMBER: _ClassVar[int]
    filename: str
    content: str
    def __init__(self, filename: _Optional[str] = ..., content: _Optional[str] = ...) -> None: ...

class ScheduleDTO(_message.Message):
    __slots__ = ("application_id", "status", "slots", "chosen_start_at", "chosen_duration_minutes", "location", "note", "cancelled_by")
    APPLICATION_ID_FIELD_NUMBER: _ClassVar[int]
    STATUS_FIELD_NUMBER: _ClassVar[int]
    SLOTS_FIELD_NUMBER: _ClassVar[int]
    CHOSEN_START_AT_FIELD_NUMBER: _ClassVar[int]
    CHOSEN_DURATION_MINUTES_FIELD_NUMBER: _ClassVar[int]
    LOCATION_FIELD_NUMBER: _ClassVar[int]
    NOTE_FIELD_NUMBER: _ClassVar[int]
    CANCELLED_BY_FIELD_NUMBER: _ClassVar[int]
    application_id: str
    status: str
    slots: _containers.RepeatedCompositeFieldContainer[ProposedSlot]
    chosen_start_at: str
    chosen_duration_minutes: int
    location: str
    note: str
    cancelled_by: str
    def __init__(self, application_id: _Optional[str] = ..., status: _Optional[str] = ..., slots: _Optional[_Iterable[_Union[ProposedSlot, _Mapping]]] = ..., chosen_start_at: _Optional[str] = ..., chosen_duration_minutes: _Optional[int] = ..., location: _Optional[str] = ..., note: _Optional[str] = ..., cancelled_by: _Optional[str] = ...) -> None: ...

class BookingDTO(_message.Message):
    __slots__ = ("application_id", "status", "chosen_start_at", "chosen_duration_minutes", "location")
    APPLICATION_ID_FIELD_NUMBER: _ClassVar[int]
    STATUS_FIELD_NUMBER: _ClassVar[int]
    CHOSEN_START_AT_FIELD_NUMBER: _ClassVar[int]
    CHOSEN_DURATION_MINUTES_FIELD_NUMBER: _ClassVar[int]
    LOCATION_FIELD_NUMBER: _ClassVar[int]
    application_id: str
    status: str
    chosen_start_at: str
    chosen_duration_minutes: int
    location: str
    def __init__(self, application_id: _Optional[str] = ..., status: _Optional[str] = ..., chosen_start_at: _Optional[str] = ..., chosen_duration_minutes: _Optional[int] = ..., location: _Optional[str] = ...) -> None: ...

class ListCandidateRequest(_message.Message):
    __slots__ = ("page", "page_size")
    PAGE_FIELD_NUMBER: _ClassVar[int]
    PAGE_SIZE_FIELD_NUMBER: _ClassVar[int]
    page: int
    page_size: int
    def __init__(self, page: _Optional[int] = ..., page_size: _Optional[int] = ...) -> None: ...

class ListCompanyRequest(_message.Message):
    __slots__ = ("status", "page", "page_size")
    STATUS_FIELD_NUMBER: _ClassVar[int]
    PAGE_FIELD_NUMBER: _ClassVar[int]
    PAGE_SIZE_FIELD_NUMBER: _ClassVar[int]
    status: str
    page: int
    page_size: int
    def __init__(self, status: _Optional[str] = ..., page: _Optional[int] = ..., page_size: _Optional[int] = ...) -> None: ...

class BookingListResponse(_message.Message):
    __slots__ = ("bookings", "page", "page_size", "total")
    BOOKINGS_FIELD_NUMBER: _ClassVar[int]
    PAGE_FIELD_NUMBER: _ClassVar[int]
    PAGE_SIZE_FIELD_NUMBER: _ClassVar[int]
    TOTAL_FIELD_NUMBER: _ClassVar[int]
    bookings: _containers.RepeatedCompositeFieldContainer[BookingDTO]
    page: int
    page_size: int
    total: int
    def __init__(self, bookings: _Optional[_Iterable[_Union[BookingDTO, _Mapping]]] = ..., page: _Optional[int] = ..., page_size: _Optional[int] = ..., total: _Optional[int] = ...) -> None: ...
