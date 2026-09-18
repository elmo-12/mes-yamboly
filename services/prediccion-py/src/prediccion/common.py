from __future__ import annotations

from datetime import datetime, timezone


def ahora_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")
