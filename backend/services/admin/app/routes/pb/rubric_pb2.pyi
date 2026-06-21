from google.protobuf.internal import containers as _containers
from google.protobuf import descriptor as _descriptor
from google.protobuf import message as _message
from collections.abc import Iterable as _Iterable, Mapping as _Mapping
from typing import ClassVar as _ClassVar, Optional as _Optional, Union as _Union

DESCRIPTOR: _descriptor.FileDescriptor

class Competency(_message.Message):
    __slots__ = ("name", "weight")
    NAME_FIELD_NUMBER: _ClassVar[int]
    WEIGHT_FIELD_NUMBER: _ClassVar[int]
    name: str
    weight: float
    def __init__(self, name: _Optional[str] = ..., weight: _Optional[float] = ...) -> None: ...

class Rubric(_message.Message):
    __slots__ = ("id", "name", "competencies")
    ID_FIELD_NUMBER: _ClassVar[int]
    NAME_FIELD_NUMBER: _ClassVar[int]
    COMPETENCIES_FIELD_NUMBER: _ClassVar[int]
    id: str
    name: str
    competencies: _containers.RepeatedCompositeFieldContainer[Competency]
    def __init__(self, id: _Optional[str] = ..., name: _Optional[str] = ..., competencies: _Optional[_Iterable[_Union[Competency, _Mapping]]] = ...) -> None: ...

class CreateRubricRequest(_message.Message):
    __slots__ = ("name", "competencies")
    NAME_FIELD_NUMBER: _ClassVar[int]
    COMPETENCIES_FIELD_NUMBER: _ClassVar[int]
    name: str
    competencies: _containers.RepeatedCompositeFieldContainer[Competency]
    def __init__(self, name: _Optional[str] = ..., competencies: _Optional[_Iterable[_Union[Competency, _Mapping]]] = ...) -> None: ...

class ListRubricsRequest(_message.Message):
    __slots__ = ()
    def __init__(self) -> None: ...

class UpdateRubricRequest(_message.Message):
    __slots__ = ("id", "name", "competencies")
    ID_FIELD_NUMBER: _ClassVar[int]
    NAME_FIELD_NUMBER: _ClassVar[int]
    COMPETENCIES_FIELD_NUMBER: _ClassVar[int]
    id: str
    name: str
    competencies: _containers.RepeatedCompositeFieldContainer[Competency]
    def __init__(self, id: _Optional[str] = ..., name: _Optional[str] = ..., competencies: _Optional[_Iterable[_Union[Competency, _Mapping]]] = ...) -> None: ...

class DeleteRubricRequest(_message.Message):
    __slots__ = ("id",)
    ID_FIELD_NUMBER: _ClassVar[int]
    id: str
    def __init__(self, id: _Optional[str] = ...) -> None: ...

class DeleteRubricResponse(_message.Message):
    __slots__ = ("ok",)
    OK_FIELD_NUMBER: _ClassVar[int]
    ok: bool
    def __init__(self, ok: _Optional[bool] = ...) -> None: ...

class RubricList(_message.Message):
    __slots__ = ("rubrics",)
    RUBRICS_FIELD_NUMBER: _ClassVar[int]
    rubrics: _containers.RepeatedCompositeFieldContainer[Rubric]
    def __init__(self, rubrics: _Optional[_Iterable[_Union[Rubric, _Mapping]]] = ...) -> None: ...
