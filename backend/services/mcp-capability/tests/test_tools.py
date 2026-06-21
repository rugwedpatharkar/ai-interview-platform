import pytest

from app import tools
from app.tools import parse_document


class _FakeStorage:
    def __init__(self, data=b""):
        self._data = data
        self.fetched = []

    async def get_raw(self, object_key):
        self.fetched.append(object_key)
        return self._data


async def test_parse_document_rejects_unsupported_type():
    with pytest.raises(ValueError, match="unsupported document type"):
        await parse_document("u/resumes/u/file.txt", storage=_FakeStorage())


async def test_parse_document_rejects_foreign_owner():
    # A key outside the owner's prefix must be refused (cross-tenant read).
    with pytest.raises(ValueError, match="outside the owner"):
        await parse_document(
            "u2/resumes/u2/file.pdf", storage=_FakeStorage(), owner="u1"
        )


async def test_parse_document_fetches_then_extracts(monkeypatch):
    monkeypatch.setitem(tools._EXTRACTORS, ".pdf", lambda data: f"text:{len(data)}")
    storage = _FakeStorage(b"BYTES")
    text = await parse_document("u/resumes/u/file.pdf", storage=storage)
    assert text == "text:5"
    assert storage.fetched == ["u/resumes/u/file.pdf"]


async def test_parse_document_rejects_empty_extracted_text(monkeypatch):
    # A scanned/empty/corrupt doc extracts to nothing; fail fast, never embed "".
    monkeypatch.setitem(tools._EXTRACTORS, ".pdf", lambda data: "   \n  ")
    with pytest.raises(ValueError, match="no extractable text"):
        await parse_document("u/resumes/u/file.pdf", storage=_FakeStorage(b"X"))
