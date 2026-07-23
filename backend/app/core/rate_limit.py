"""In-memory sliding-window rate limiter (dev).

Deliberately process-local and simple. In production this moves behind Redis so
limits hold across instances; the call sites stay the same.
"""

from __future__ import annotations

import threading
import time
from collections import defaultdict, deque


class RateLimiter:
    def __init__(self) -> None:
        self._hits: dict[str, deque[float]] = defaultdict(deque)
        self._lock = threading.Lock()

    def reset(self) -> None:
        with self._lock:
            self._hits.clear()

    def allow(self, key: str, max_hits: int, window_seconds: int) -> bool:
        """Record a hit for `key`; return False if it exceeds `max_hits` within
        the trailing `window_seconds`."""
        now = time.monotonic()
        cutoff = now - window_seconds
        with self._lock:
            hits = self._hits[key]
            while hits and hits[0] < cutoff:
                hits.popleft()
            if len(hits) >= max_hits:
                return False
            hits.append(now)
            return True


# Shared process-wide limiter.
rate_limiter = RateLimiter()
