"""Sentence-aware chunking + content-hash dedup.

`chunk` packs whole sentences into ~`window`-char windows that carry an `overlap`-char
tail forward for context continuity (a sentence longer than the window becomes its own
chunk — we never split mid-sentence). `content_hash` is the sha256 used to dedup chunks
on ingest so re-crawling the same source upserts nothing new.
"""

import hashlib
import re

_SENTENCE_BOUNDARY = re.compile(r"(?<=[.!?])\s+")


def _split_sentences(text):
    return [s.strip() for s in _SENTENCE_BOUNDARY.split(text.strip()) if s.strip()]


def _overlap_tail(sentences, overlap):
    tail, length = [], 0
    for sentence in reversed(sentences):
        if length + len(sentence) > overlap:
            break
        tail.insert(0, sentence)
        length += len(sentence) + 1
    return tail


def chunk(text, window=1024, overlap=128):
    chunks, current = [], []
    for sentence in _split_sentences(text):
        if current and len(" ".join([*current, sentence])) > window:
            chunks.append(" ".join(current))
            current = _overlap_tail(current, overlap)
        current.append(sentence)
    if current:
        chunks.append(" ".join(current))
    return chunks


def content_hash(text):
    return hashlib.sha256(text.encode()).hexdigest()
