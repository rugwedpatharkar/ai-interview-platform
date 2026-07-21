"""Fetch seam: URL -> {text, url} for KB ingestion.

Contract: `fetch(url) -> {"text": str, "url": str}`. `HttpFetcher` keeps its httpx +
BeautifulSoup imports call-local; `FakeFetcher` serves canned pages so ingestion is
unit-tested without network.

`HttpFetcher` is an SSRF-safe fetcher: https-only, disallows private/loopback/link-local
IPs (blocks cloud-metadata endpoints like 169.254.169.254), and re-validates every
redirect hop so a public host can't 302 into an internal one.
"""

import asyncio
import ipaddress
import urllib.parse

from lib import timeouts

# Hostnames that resolve to public IPs but always mean "cloud metadata service" and must
# never be fetched from a tool that acts on caller-supplied URLs.
_BLOCKED_HOSTS = frozenset({"metadata.google.internal", "metadata.goog"})
_MAX_REDIRECTS = 3


class SsrfBlocked(ValueError):
    """Raised when a URL fails SSRF validation."""


async def _validate_url(url: str) -> None:
    parsed = urllib.parse.urlparse(url)
    if parsed.scheme != "https":
        raise SsrfBlocked(f"only https URLs are allowed; got scheme {parsed.scheme!r}")
    host = parsed.hostname
    if not host:
        raise SsrfBlocked(f"URL is missing a host: {url!r}")
    if host.lower() in _BLOCKED_HOSTS:
        raise SsrfBlocked(f"blocked host: {host}")
    # Resolve so a DNS-based bypass (mydomain.com -> 169.254.169.254) can't slip past.
    loop = asyncio.get_running_loop()
    infos = await loop.getaddrinfo(host, None)
    for _family, _socktype, _proto, _canon, sockaddr in infos:
        raw = sockaddr[0]
        if "%" in raw:  # strip IPv6 zone id
            raw = raw.split("%", 1)[0]
        ip = ipaddress.ip_address(raw)
        if (
            ip.is_private
            or ip.is_loopback
            or ip.is_link_local
            or ip.is_multicast
            or ip.is_reserved
            or ip.is_unspecified
        ):
            raise SsrfBlocked(f"URL {url} resolves to blocked address {ip}")


class HttpFetcher:
    def __init__(self, timeout=None):
        self._timeout = timeout if timeout is not None else timeouts.http_client()

    async def fetch(self, url):
        import httpx
        from bs4 import BeautifulSoup

        await _validate_url(url)
        current = url
        # follow_redirects=False + a manual loop lets us re-validate each hop; a public
        # attacker-controlled host cannot 302 into 169.254.169.254 to bypass the guard.
        async with httpx.AsyncClient(
            timeout=self._timeout, follow_redirects=False
        ) as client:
            for _ in range(_MAX_REDIRECTS + 1):
                response = await client.get(current)
                if response.is_redirect:
                    location = response.headers.get("Location")
                    if not location:
                        break
                    current = str(httpx.URL(current).join(location))
                    await _validate_url(current)
                    continue
                response.raise_for_status()
                break
            else:
                raise RuntimeError(f"too many redirects fetching {url}")
        text = BeautifulSoup(response.text, "html.parser").get_text(" ", strip=True)
        return {"text": text, "url": current}


class FakeFetcher:
    """Canned URL -> text map for offline ingestion tests."""

    def __init__(self, pages=None):
        self._pages = pages or {}
        self.fetched = []

    async def fetch(self, url):
        self.fetched.append(url)
        return {"text": self._pages.get(url, ""), "url": url}
