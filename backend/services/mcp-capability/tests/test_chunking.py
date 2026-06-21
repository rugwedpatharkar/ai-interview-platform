"""Sentence-aware chunking + content-hash dedup for KB ingestion."""

from app.chunking import chunk, content_hash


def test_short_text_is_one_chunk():
    assert chunk("One short sentence. Two short.", window=1024) == [
        "One short sentence. Two short."
    ]


def test_empty_text_yields_no_chunks():
    assert chunk("") == []


def test_window_and_overlap_are_honoured():
    text = " ".join(f"sentence number {i}." for i in range(30))
    chunks = chunk(text, window=60, overlap=25)
    assert len(chunks) >= 2
    assert all(len(c) <= 60 for c in chunks)
    # Each chunk after the first begins with a sentence carried over from the prior one.
    carried = chunks[1].split(".")[0]
    assert carried in chunks[0]


def test_oversized_sentence_is_its_own_chunk():
    long = "x" * 200
    chunks = chunk(f"{long}. short tail.", window=50, overlap=10)
    assert f"{long}." in chunks


def test_content_hash_is_deterministic_and_distinct():
    assert content_hash("alpha") == content_hash("alpha")
    assert content_hash("alpha") != content_hash("beta")
    assert len(content_hash("alpha")) == 64
