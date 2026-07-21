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


async def _resolve_ips(host: str) -> set[str]:
    """Return the set of IPs `host` resolves to (v4 + v6, zone-id stripped)."""
    loop = asyncio.get_running_loop()
    infos = await loop.getaddrinfo(host, None)
    out: set[str] = set()
    for _family, _socktype, _proto, _canon, sockaddr in infos:
        raw = sockaddr[0]
        if "%" in raw:
            raw = raw.split("%", 1)[0]
        out.add(raw)
    return out


def _classify_ips(ips: set[str], url: str) -> None:
    """Reject if any resolved IP is in a blocked range (private, loopback, etc.)."""
    for raw in ips:
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


async def _validate_url(url: str) -> set[str]:
    parsed = urllib.parse.urlparse(url)
    if parsed.scheme != "https":
        raise SsrfBlocked(f"only https URLs are allowed; got scheme {parsed.scheme!r}")
    host = parsed.hostname
    if not host:
        raise SsrfBlocked(f"URL is missing a host: {url!r}")
    if host.lower() in _BLOCKED_HOSTS:
        raise SsrfBlocked(f"blocked host: {host}")
    ips = await _resolve_ips(host)
    _classify_ips(ips, url)
    return ips


class HttpFetcher:
    def __init__(self, timeout=None):
        self._timeout = timeout if timeout is not None else timeouts.http_client()

    async def fetch(self, url):
        import httpx
        from bs4 import BeautifulSoup

        allowed = await _validate_url(url)
        current = url
        # follow_redirects=False + a manual loop lets us re-validate each hop; a public
        # attacker-controlled host cannot 302 into 169.254.169.254 to bypass the guard.
        # DNS-rebinding mitigation: right before each GET, re-resolve and require that
        # every returned IP is a subset of the pre-validated set. If the resolver
        # returned different IPs the second time (rebinding attack), block. Not
        # bulletproof — an attacker who returns BOTH the public IP + a private IP on
        # both lookups still slips through the check. Truly airtight requires pinning
        # the connection to the validated IP + SNI-preserving TLS via a custom httpx
        # transport; that's a bigger refactor tracked separately.
        async with httpx.AsyncClient(
            timeout=self._timeout, follow_redirects=False
        ) as client:
            for _ in range(_MAX_REDIRECTS + 1):
                host = urllib.parse.urlparse(current).hostname or ""
                fresh = await _resolve_ips(host)
                if not fresh.issubset(allowed):
                    raise SsrfBlocked(
                        f"DNS-rebinding detected for {host}: "
                        f"validated {sorted(allowed)}, resolver returned {sorted(fresh)}"
                    )
                # Also re-classify the fresh set — belt-and-braces if the allowed set
                # accidentally contained a private IP (shouldn't, but cheap to check).
                _classify_ips(fresh, current)
                response = await client.get(current)
                if response.is_redirect:
                    location = response.headers.get("Location")
                    if not location:
                        break
                    current = str(httpx.URL(current).join(location))
                    allowed = await _validate_url(current)
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
