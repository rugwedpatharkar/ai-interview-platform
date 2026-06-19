from app.routes.auth import _client_ip


class _Ctx:
    def __init__(self, metadata, peer):
        self._metadata = metadata
        self._peer = peer

    def invocation_metadata(self):
        return self._metadata

    def peer(self):
        return self._peer


def test_client_ip_ignores_forwarded_without_trusted_proxy():
    # X-Forwarded-For is attacker-controlled with no proxy in front — must be ignored.
    ctx = _Ctx([("x-forwarded-for", "1.2.3.4")], "ipv4:10.0.0.1:51000")
    assert _client_ip(ctx) == "ipv4:10.0.0.1:51000"


def test_client_ip_trusts_forwarded_when_proxied():
    ctx = _Ctx([("x-forwarded-for", "1.2.3.4, 9.9.9.9")], "ipv4:10.0.0.1:51000")
    assert _client_ip(ctx, trusted_proxy=True) == "1.2.3.4"
