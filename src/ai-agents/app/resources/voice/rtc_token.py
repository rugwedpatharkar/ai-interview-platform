"""LiveKit RTC join-token minter.

Produces a short-TTL, room-scoped JWT that lets a candidate join exactly one
LiveKit room. Secrets are supplied by the caller (read from Settings); this
module never imports config directly so it remains testable in isolation.
"""

from datetime import timedelta

from livekit import api


def mint_join_token(
    room: str,
    identity: str,
    *,
    api_key: str,
    api_secret: str,
    ttl_seconds: int = 900,
) -> str:
    """Return a signed LiveKit access token scoped to *room* for *identity*.

    Args:
        room: LiveKit room name (e.g. ``"interview-<application_id>"``).
        identity: Participant identity — typically the candidate's user_id.
        api_key: LiveKit API key (from env; never hard-code).
        api_secret: LiveKit API secret (from env; never hard-code).
        ttl_seconds: Token lifetime in seconds (default 900 = 15 min).

    Returns:
        A signed JWT string that the frontend passes to ``room.connect()``.
    """
    return (
        api.AccessToken(api_key, api_secret)
        .with_identity(identity)
        .with_ttl(timedelta(seconds=ttl_seconds))
        .with_grants(
            api.VideoGrants(
                room_join=True,
                room=room,
                can_publish=True,
                can_subscribe=True,
                can_publish_data=True,
            )
        )
        .to_jwt()
    )
