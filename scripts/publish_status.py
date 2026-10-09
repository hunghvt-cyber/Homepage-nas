#!/usr/bin/env python3
"""Publish a small public snapshot derived only from existing NAS caches."""
import fcntl
import json
import os
import signal
import sys
import tempfile
import time
from datetime import datetime, timezone
from pathlib import Path

CACHE = Path(os.environ.get("STATUS_CACHE", "/var/lib/fnnas-monitor/snapshot.json"))
MAINTENANCE = Path(os.environ.get(
    "STATUS_MAINTENANCE", "/vol1/Docker/tapo-nas-lab/state/daily-maintenance/latest.env"
))
TOKEN_FILE = Path(os.environ.get("STATUS_TOKEN_FILE", "~/.config/homepage-nas/blob-token")).expanduser()
OUTPUT = Path(os.environ.get("STATUS_OUTPUT", "~/.local/state/homepage-status/nas-status.json")).expanduser()
LOCK = OUTPUT.with_suffix(".lock")
STATES = {"ok", "pass", "warn", "fail", "unknown"}
MAX_CACHE_AGE = 120
MAX_MAINTENANCE_AGE = 15 * 60


def iso(epoch):
    return datetime.fromtimestamp(epoch, timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def valid_state(value):
    return value if value in STATES else "unknown"


def read_maintenance():
    try:
        values = {}
        for line in MAINTENANCE.read_text(encoding="utf-8").splitlines():
            key, sep, value = line.partition("=")
            if sep and key in {"LAST_UPDATE", "STATUS", "RETENTION"}:
                values[key] = value
        measured = datetime.fromisoformat(values["LAST_UPDATE"]).timestamp()
        age = time.time() - measured
        fresh = 0 <= age <= MAX_MAINTENANCE_AGE
        maintenance_state = {"PASS": "pass", "WARN": "warn", "FAIL": "fail"}.get(values.get("STATUS"), "unknown")
        retention_state = {"PASS": "pass", "DRY_RUN": "warn", "BLOCKED": "warn", "FAIL": "fail"}.get(values.get("RETENTION"), "unknown")
        return {
            "maintenance": {"state": valid_state(maintenance_state) if fresh else "unknown", "measured_at": iso(measured)},
            "retention": {"state": valid_state(retention_state) if fresh else "unknown", "measured_at": iso(measured)},
        }
    except (OSError, KeyError, ValueError, OverflowError):
        return {"maintenance": {"state": "unknown", "measured_at": None}, "retention": {"state": "unknown", "measured_at": None}}


def make_snapshot():
    try:
        source = json.loads(CACHE.read_text(encoding="utf-8"))
        updated = float(source["updated_at"])
        age = time.time() - updated
        fresh = 0 <= age <= MAX_CACHE_AGE
    except (OSError, ValueError, KeyError, TypeError):
        source, updated, fresh = {}, None, False

    nas_state = "unknown"
    if fresh and source.get("host", {}).get("status") != "unavailable":
        filesystems = {item.get("path"): item for item in source.get("host", {}).get("filesystems", [])}
        root, volume = filesystems.get("/"), filesystems.get("/vol1")
        if root and volume and root.get("status") == volume.get("status") == "ok":
            total = volume.get("total_bytes", 0)
            free = volume.get("available_bytes", 0)
            nas_state = "warn" if total <= 0 or free / total < 0.05 else "ok"

    snapshot = {
        "schema": 1,
        "updated_at": iso(updated) if updated is not None else None,
        "cam1": {"state": "unknown"},
        "cam2": {"state": "unknown"},
        "nas": {"state": nas_state},
        **read_maintenance(),
    }
    validate(snapshot)
    return snapshot


def validate(data):
    assert set(data) == {"schema", "updated_at", "cam1", "cam2", "nas", "maintenance", "retention"}
    assert data["schema"] == 1
    for name in ("cam1", "cam2", "nas"):
        assert set(data[name]) == {"state"} and data[name]["state"] in STATES
    for name in ("maintenance", "retention"):
        assert set(data[name]) == {"state", "measured_at"}
        assert data[name]["state"] in STATES
        assert data[name]["measured_at"] is None or isinstance(data[name]["measured_at"], str)
    assert data["updated_at"] is None or isinstance(data["updated_at"], str)
    # Allowlist output is intentionally tiny; reject accidental operational fields.
    assert len(json.dumps(data, separators=(",", ":"))) < 2048


def timeout(_signum, _frame):
    raise TimeoutError("upload deadline exceeded")


def main():
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    with LOCK.open("a") as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            return 0
        snapshot = make_snapshot()
        payload = (json.dumps(snapshot, separators=(",", ":"), ensure_ascii=True) + "\n").encode()
        fd, temp_name = tempfile.mkstemp(prefix="status-", dir=OUTPUT.parent)
        try:
            with os.fdopen(fd, "wb") as output:
                output.write(payload)
                output.flush()
                os.fsync(output.fileno())
            os.chmod(temp_name, 0o600)
            os.replace(temp_name, OUTPUT)
        finally:
            if os.path.exists(temp_name):
                os.unlink(temp_name)

        token = TOKEN_FILE.read_text(encoding="utf-8").strip()
        if not token:
            raise RuntimeError("Blob token file is empty")
        from vercel.blob import put

        signal.signal(signal.SIGALRM, timeout)
        signal.alarm(25)
        try:
            result = put(
                "nas-status.json", payload, access="public", content_type="application/json",
                add_random_suffix=False, overwrite=True, cache_control_max_age=300,
                token=token, multipart=False,
            )
        finally:
            signal.alarm(0)
        # Print only the public URL for initial configuration; never print credentials.
        print(result.url)
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(f"status publish failed: {type(exc).__name__}", file=sys.stderr)
        raise SystemExit(1)
