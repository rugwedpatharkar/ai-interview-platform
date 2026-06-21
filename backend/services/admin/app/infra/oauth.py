"""OAuth client seam: exchange an authorization code for a verified email.

`HttpOAuthClient` talks to the real provider (token + userinfo) with a call-local httpx
import, so this module imports no SDK. `FakeOAuthClient` returns a canned verified email
so SSO is unit-tested offline; live provider exchange defers until creds exist.
"""

from lib.logging import get_logger, log_context

from app.errors import InvalidTokenError
from lib import timeouts

log = get_logger(component="infra.oauth")


class HttpOAuthClient:
    def __init__(self, providers):
        # providers: {name: {token_url, userinfo_url, client_id, client_secret}}
        self._providers = providers

    async def exchange(self, provider, code):
        import httpx

        cfg = self._providers.get(provider)
        if cfg is None:
            log.warning("oauth.exchange: unknown provider={}", provider)
            raise InvalidTokenError(f"unknown OAuth provider: {provider}")
        async with log_context(log, "oauth.exchange", provider=provider):
            async with httpx.AsyncClient(timeout=timeouts.http_client()) as client:
                token_resp = await client.post(
                    cfg["token_url"],
                    data={
                        "grant_type": "authorization_code",
                        "code": code,
                        "client_id": cfg["client_id"],
                        "client_secret": cfg["client_secret"],
                        "redirect_uri": cfg["redirect_uri"],
                    },
                )
                token_resp.raise_for_status()
                access = token_resp.json().get("access_token")
                if not access:
                    log.error(
                        "oauth.exchange: provider={} token response missing"
                        " access_token",
                        provider,
                    )
                    raise InvalidTokenError("OAuth token response missing access_token")
                info = await client.get(
                    cfg["userinfo_url"], headers={"Authorization": f"Bearer {access}"}
                )
                info.raise_for_status()
            data = info.json()
            email = data.get("email")
            if not email:
                log.error(
                    "oauth.exchange: provider={} userinfo missing email", provider
                )
                raise InvalidTokenError("OAuth userinfo missing email")
        return email, bool(data.get("email_verified"))


class FakeOAuthClient:
    """Canned (email, verified) for offline SSO tests."""

    def __init__(self, email, verified=True):
        self._email = email
        self._verified = verified

    async def exchange(self, provider, code):
        return self._email, self._verified
