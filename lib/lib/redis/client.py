from redis.asyncio import Redis, from_url


def create_redis(url: str) -> Redis:
    """Create an async Redis client. `decode_responses=True` → str in/out."""
    return from_url(url, decode_responses=True)
