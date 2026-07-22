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


def _pin_url_to_ip(url: str, ip: str) -> tuple[str, str]:
    """Rewrite the URL so the netloc uses the literal IP (bracketed for IPv6), keeping
    the port + path + query. Returns (rewritten_url, original_host_header) so the
    caller can set the Host request header to the original hostname."""
    parsed = urllib.parse.urlparse(url)
    host = parsed.hostname or ""
    port = f":{parsed.port}" if parsed.port else ""
    ip_netloc = (f"[{ip}]" + port) if ":" in ip else (ip + port)
    return urllib.parse.urlunparse(parsed._replace(netloc=ip_netloc)), (
        host + port if port else host
    )


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
        #
        # DNS-rebinding hard mitigation (H3 completion): before each GET we PIN the
        # connection to a specific validated IP by rewriting the URL netloc to the IP
        # literal and passing sni_hostname + Host header for the original hostname.
        # httpx forwards sni_hostname through to httpcore; TLS SNI + cert-hostname
        # verification both use the original name (so we still trust "example.com"
        # even though we connect straight to its IP). This closes the classic rebind
        # window where the validator resolves host->public-IP but the connect resolves
        # host->private-IP a moment later.
        async with httpx.AsyncClient(
            timeout=self._timeout, follow_redirects=False
        ) as client:
            for _ in range(_MAX_REDIRECTS + 1):
                host = urllib.parse.urlparse(current).hostname or ""
                # Belt-and-braces re-classify: if some upstream ever grew a resolver
                # that returned a private IP mixed with a public one, the second-pass
                # check catches it before we pin.
                _classify_ips(allowed, current)
                # Deterministic pick so the same URL always hits the same IP within
                # this fetch — no accidental round-robin into a blocked address.
                pinned_ip = sorted(allowed)[0]
                connect_url, host_header = _pin_url_to_ip(current, pinned_ip)
                response = await client.get(
                    connect_url,
                    headers={"Host": host_header},
                    extensions={"sni_hostname": host},
                )
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
