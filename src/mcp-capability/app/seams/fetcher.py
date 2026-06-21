"""Fetch seam: URL -> {text, url} for KB ingestion.

Contract: `fetch(url) -> {"text": str, "url": str}`. `HttpFetcher` keeps its httpx +
BeautifulSoup imports call-local; `FakeFetcher` serves canned pages so ingestion is
unit-tested without network.
"""

from lib import timeouts


class HttpFetcher:
    def __init__(self, timeout=None):
        self._timeout = timeout if timeout is not None else timeouts.http_client()

    async def fetch(self, url):
        import httpx
        from bs4 import BeautifulSoup

        async with httpx.AsyncClient(
            timeout=self._timeout, follow_redirects=True
        ) as client:
            response = await client.get(url)
            response.raise_for_status()
        text = BeautifulSoup(response.text, "html.parser").get_text(" ", strip=True)
        return {"text": text, "url": url}


class FakeFetcher:
    """Canned URL -> text map for offline ingestion tests."""

    def __init__(self, pages=None):
        self._pages = pages or {}
        self.fetched = []

    async def fetch(self, url):
        self.fetched.append(url)
        return {"text": self._pages.get(url, ""), "url": url}
