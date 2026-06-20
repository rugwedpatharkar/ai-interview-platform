from google.protobuf.internal import containers as _containers
from google.protobuf import descriptor as _descriptor
from google.protobuf import message as _message
from collections.abc import Iterable as _Iterable, Mapping as _Mapping
from typing import ClassVar as _ClassVar, Optional as _Optional, Union as _Union

DESCRIPTOR: _descriptor.FileDescriptor

class GetCodingTaskRequest(_message.Message):
    __slots__ = ("application_id",)
    APPLICATION_ID_FIELD_NUMBER: _ClassVar[int]
    application_id: str
    def __init__(self, application_id: _Optional[str] = ...) -> None: ...

class TestCase(_message.Message):
    __slots__ = ("stdin", "expected_stdout")
    STDIN_FIELD_NUMBER: _ClassVar[int]
    EXPECTED_STDOUT_FIELD_NUMBER: _ClassVar[int]
    stdin: str
    expected_stdout: str
    def __init__(self, stdin: _Optional[str] = ..., expected_stdout: _Optional[str] = ...) -> None: ...

class TypedQuestion(_message.Message):
    __slots__ = ("id", "prompt")
    ID_FIELD_NUMBER: _ClassVar[int]
    PROMPT_FIELD_NUMBER: _ClassVar[int]
    id: str
    prompt: str
    def __init__(self, id: _Optional[str] = ..., prompt: _Optional[str] = ...) -> None: ...

class CodingTask(_message.Message):
    __slots__ = ("application_id", "title", "prompt", "languages", "starter_code", "sample_cases", "typed_questions", "cpu_seconds", "wall_seconds")
    APPLICATION_ID_FIELD_NUMBER: _ClassVar[int]
    TITLE_FIELD_NUMBER: _ClassVar[int]
    PROMPT_FIELD_NUMBER: _ClassVar[int]
    LANGUAGES_FIELD_NUMBER: _ClassVar[int]
    STARTER_CODE_FIELD_NUMBER: _ClassVar[int]
    SAMPLE_CASES_FIELD_NUMBER: _ClassVar[int]
    TYPED_QUESTIONS_FIELD_NUMBER: _ClassVar[int]
    CPU_SECONDS_FIELD_NUMBER: _ClassVar[int]
    WALL_SECONDS_FIELD_NUMBER: _ClassVar[int]
    application_id: str
    title: str
    prompt: str
    languages: _containers.RepeatedScalarFieldContainer[str]
    starter_code: str
    sample_cases: _containers.RepeatedCompositeFieldContainer[TestCase]
    typed_questions: _containers.RepeatedCompositeFieldContainer[TypedQuestion]
    cpu_seconds: int
    wall_seconds: int
    def __init__(self, application_id: _Optional[str] = ..., title: _Optional[str] = ..., prompt: _Optional[str] = ..., languages: _Optional[_Iterable[str]] = ..., starter_code: _Optional[str] = ..., sample_cases: _Optional[_Iterable[_Union[TestCase, _Mapping]]] = ..., typed_questions: _Optional[_Iterable[_Union[TypedQuestion, _Mapping]]] = ..., cpu_seconds: _Optional[int] = ..., wall_seconds: _Optional[int] = ...) -> None: ...

class RunCodeRequest(_message.Message):
    __slots__ = ("application_id", "language", "source", "stdin")
    APPLICATION_ID_FIELD_NUMBER: _ClassVar[int]
    LANGUAGE_FIELD_NUMBER: _ClassVar[int]
    SOURCE_FIELD_NUMBER: _ClassVar[int]
    STDIN_FIELD_NUMBER: _ClassVar[int]
    application_id: str
    language: str
    source: str
    stdin: str
    def __init__(self, application_id: _Optional[str] = ..., language: _Optional[str] = ..., source: _Optional[str] = ..., stdin: _Optional[str] = ...) -> None: ...

class RunResult(_message.Message):
    __slots__ = ("stdout", "stderr", "exit_code", "time_ms", "timed_out")
    STDOUT_FIELD_NUMBER: _ClassVar[int]
    STDERR_FIELD_NUMBER: _ClassVar[int]
    EXIT_CODE_FIELD_NUMBER: _ClassVar[int]
    TIME_MS_FIELD_NUMBER: _ClassVar[int]
    TIMED_OUT_FIELD_NUMBER: _ClassVar[int]
    stdout: str
    stderr: str
    exit_code: int
    time_ms: int
    timed_out: bool
    def __init__(self, stdout: _Optional[str] = ..., stderr: _Optional[str] = ..., exit_code: _Optional[int] = ..., time_ms: _Optional[int] = ..., timed_out: _Optional[bool] = ...) -> None: ...

class TypedAnswer(_message.Message):
    __slots__ = ("id", "answer")
    ID_FIELD_NUMBER: _ClassVar[int]
    ANSWER_FIELD_NUMBER: _ClassVar[int]
    id: str
    answer: str
    def __init__(self, id: _Optional[str] = ..., answer: _Optional[str] = ...) -> None: ...

class SubmitCodingRequest(_message.Message):
    __slots__ = ("application_id", "language", "source", "typed_answers")
    APPLICATION_ID_FIELD_NUMBER: _ClassVar[int]
    LANGUAGE_FIELD_NUMBER: _ClassVar[int]
    SOURCE_FIELD_NUMBER: _ClassVar[int]
    TYPED_ANSWERS_FIELD_NUMBER: _ClassVar[int]
    application_id: str
    language: str
    source: str
    typed_answers: _containers.RepeatedCompositeFieldContainer[TypedAnswer]
    def __init__(self, application_id: _Optional[str] = ..., language: _Optional[str] = ..., source: _Optional[str] = ..., typed_answers: _Optional[_Iterable[_Union[TypedAnswer, _Mapping]]] = ...) -> None: ...

class SubmitResult(_message.Message):
    __slots__ = ("passed", "cases_passed", "cases_total", "typed_correct", "typed_total")
    PASSED_FIELD_NUMBER: _ClassVar[int]
    CASES_PASSED_FIELD_NUMBER: _ClassVar[int]
    CASES_TOTAL_FIELD_NUMBER: _ClassVar[int]
    TYPED_CORRECT_FIELD_NUMBER: _ClassVar[int]
    TYPED_TOTAL_FIELD_NUMBER: _ClassVar[int]
    passed: bool
    cases_passed: int
    cases_total: int
    typed_correct: int
    typed_total: int
    def __init__(self, passed: _Optional[bool] = ..., cases_passed: _Optional[int] = ..., cases_total: _Optional[int] = ..., typed_correct: _Optional[int] = ..., typed_total: _Optional[int] = ...) -> None: ...
