from __future__ import annotations

import hashlib
import logging
from ipaddress import ip_address, ip_network

from app.core import redis_client
from app.core.config import get_settings
from fastapi import HTTPException, Request, status

logger = logging.getLogger(__name__)

_TRUSTED_PROXY_NETWORKS = [
    ip_network("127.0.0.1/32"),
    ip_network("::1/128"),
    ip_network("10.0.0.0/8"),
    ip_network("172.16.0.0/12"),
    ip_network("192.168.0.0/16"),
]

_RATE_LIMIT_LUA = r"""
local limit = tonumber(ARGV[1])
local ttl = tonumber(ARGV[2])
local count = redis.call('INCR', KEYS[1])
if count == 1 then
    redis.call('EXPIRE', KEYS[1], ttl)
end
local remaining = redis.call('TTL', KEYS[1])
if remaining < 0 then
    redis.call('EXPIRE', KEYS[1], ttl)
    remaining = ttl
end
return {count, remaining}
"""


def _is_trusted_proxy(host: str | None) -> bool:
    if host is None:
        return False
    try:
        addr = ip_address(host)
    except ValueError:
        # TestClient and some local callers may not provide a parseable IP.
        return host in {"testclient", "localhost"}
    return addr.is_loopback or any(addr in network for network in _TRUSTED_PROXY_NETWORKS)


def _extract_client_ip(request: Request) -> str:
    peer_host = request.client.host if request.client else None
    if peer_host and _is_trusted_proxy(peer_host):
        forwarded_for = request.headers.get("x-forwarded-for")
        if forwarded_for:
            first = forwarded_for.split(",")[0].strip()
            if first:
                return first
    return peer_host or "unknown"


def _normalize_account_identifier(username: str) -> str:
    return username.strip().casefold()


def _build_keys(ip: str, username: str) -> tuple[str, str]:
    account_hash = hashlib.sha256(username.encode("utf-8")).hexdigest()
    prefix = "auth:login_rate_limit"
    ip_key = f"{prefix}:ip:{ip}"
    account_key = f"{prefix}:account:{account_hash}"
    return ip_key, account_key


def _rate_limit_unavailable() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        detail="Authentication service unavailable",
    )


async def _check_counter(client: object, key: str, limit: int, ttl: int) -> tuple[bool, int]:
    try:
        count, remaining_ttl = await client.eval(  # type: ignore[attr-defined]
            _RATE_LIMIT_LUA, 1, key, limit, ttl
        )
    except Exception as exc:
        logger.warning("Login rate limiter Redis error for key scope: %s", type(exc).__name__)
        raise _rate_limit_unavailable() from exc

    retry_after = max(1, int(remaining_ttl))
    return int(count) > limit, retry_after


async def enforce_login_rate_limit(request: Request, username: str) -> None:
    """Apply fixed-window login rate limiting before password verification.

    Counts are incremented atomically in Redis for both IP and normalized account
    dimensions on every attempt, including unknown or inactive accounts.
    Redis failures fail closed with 503.
    """
    settings = get_settings()
    client_ip = _extract_client_ip(request)
    normalized_account = _normalize_account_identifier(username)
    ip_key, account_key = _build_keys(client_ip, normalized_account)

    try:
        redis = redis_client.get_redis_client()
    except Exception as exc:
        logger.warning("Login rate limiter Redis unavailable: %s", type(exc).__name__)
        raise _rate_limit_unavailable() from exc

    ttl = settings.login_rate_limit_cooldown_seconds
    ip_exceeded, ip_retry = await _check_counter(
        redis, ip_key, settings.login_rate_limit_ip_max_attempts, ttl
    )
    account_exceeded, account_retry = await _check_counter(
        redis,
        account_key,
        settings.login_rate_limit_account_max_attempts,
        ttl,
    )

    if ip_exceeded or account_exceeded:
        retry_after = max(
            ip_retry if ip_exceeded else 0,
            account_retry if account_exceeded else 0,
        )
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many login attempts. Please try again later.",
            headers={"Retry-After": str(retry_after)},
        )
