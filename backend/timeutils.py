"""Time helpers. Project invariant: stored datetimes are timezone-naive UTC."""

from __future__ import annotations

from datetime import UTC, datetime


def utcnow() -> datetime:
    """Timezone-naive UTC 'now' — non-deprecated replacement for datetime.utcnow()."""
    return datetime.now(UTC).replace(tzinfo=None)
