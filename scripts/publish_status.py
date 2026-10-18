#!/usr/bin/env python3
"""Publish a small public snapshot derived only from existing NAS caches."""
import fcntl
import hashlib
import json
import math
import os
import re
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
VERIFIED_RETENTION = Path(os.environ.get(
    "STATUS_VERIFIED_RETENTION", "/vol1/Docker/tapo-nas-lab/state/retention-auto/latest.json"
))
VERIFIED_RETENTION_RESULTS = Path(os.environ.get(
    "STATUS_VERIFIED_RETENTION_RESULTS", "/vol1/Docker/tapo-nas-lab/state/verified-retention"
))
TOKEN_FILE = Path(os.environ.get("STATUS_TOKEN_FILE", "~/.config/homepage-nas/blob-token")).expanduser()
OUTPUT = Path(os.environ.get("STATUS_OUTPUT", "~/.local/state/homepage-status/nas-status.json")).expanduser()
LOCK = OUTPUT.with_suffix(".lock")
STATES = {"ok", "pass", "warn", "fail", "unknown"}
MAX_CACHE_AGE = 120
MAX_RECORDING_AGE = 15 * 60
MAX_HEALTH_AGE = 15 * 60
FUTURE_SKEW = 5 * 60


def iso(epoch):
    return datetime.fromtimestamp(epoch, timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def epoch(value):
    """Parse Unix seconds or an ISO timestamp with an explicit timezone."""
    try:
        if isinstance(value, (int, float)) and not isinstance(value, bool):
            return float(value)
        if isinstance(value, str):
            parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
            if parsed.tzinfo is not None:
                return parsed.timestamp()
    except (ValueError, OverflowError, OSError):
        pass
    return None


def valid_state(value):
    return value if value in STATES else "unknown"


def read_maintenance(path=MAINTENANCE):
    try:
        values = {}
        for line in path.read_text(encoding="utf-8").splitlines():
            key, sep, value = line.partition("=")
            if sep and key in {"LAST_UPDATE", "STATUS"}:
                values[key] = value
        measured = epoch(values["LAST_UPDATE"])
        if measured is None or not math.isfinite(measured) or measured > time.time() + FUTURE_SKEW:
            raise ValueError("invalid maintenance timestamp")
        maintenance_state = {"PASS": "pass", "WARN": "warn", "FAIL": "fail"}.get(values.get("STATUS"), "unknown")
        return {
            "maintenance": {"state": valid_state(maintenance_state), "measured_at": iso(measured)},
        }
    except (OSError, KeyError, ValueError, OverflowError):
        return {"maintenance": {"state": "unknown", "measured_at": None}}


def read_verified_retention(path=VERIFIED_RETENTION, results_root=VERIFIED_RETENTION_RESULTS):
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(data, dict):
            raise ValueError("invalid retention result")
        if not isinstance(data.get("started"), str) or not isinstance(data.get("finished"), str):
            raise ValueError("missing retention timestamps")
        started, finished = epoch(data.get("started")), epoch(data.get("finished"))
        jobs = data.get("jobs")
        if (started is None or finished is None or not math.isfinite(started) or not math.isfinite(finished)
                or finished < started or finished > time.time() + FUTURE_SKEW):
            raise ValueError("invalid retention timestamps")
        started_text = data.get("started")
        started_date = datetime.fromisoformat(started_text.replace("Z", "+00:00")).date().isoformat()
        if data.get("date") != started_date:
            raise ValueError("retention date mismatch")
        if not isinstance(jobs, list) or not jobs:
            raise ValueError("missing retention jobs")
        job_states = []
        results_root = results_root.resolve()
        for job in jobs:
            if not isinstance(job, dict):
                raise ValueError("invalid retention job")
            result_name, expected_hash = job.get("result"), job.get("result_sha256")
            if not isinstance(result_name, str) or not isinstance(expected_hash, str):
                raise ValueError("missing retention job evidence")
            result_path = Path(result_name).resolve()
            if not result_path.is_relative_to(results_root):
                raise ValueError("retention evidence outside configured root")
            result_bytes = result_path.read_bytes()
            if hashlib.sha256(result_bytes).hexdigest() != expected_hash:
                raise ValueError("retention evidence hash mismatch")
            result_data = json.loads(result_bytes)
            if (not isinstance(result_data, dict) or result_data.get("schema") != 1
                    or result_data.get("mode") != "APPLY" or result_data.get("policy") != job.get("policy")):
                raise ValueError("retention evidence is not an applied result")
            job_states.append({"PASS": "pass", "WARN": "warn", "FAIL": "fail"}.get(job.get("status"), "unknown"))
        overall = {"PASS": "pass", "WARN": "warn", "FAIL": "fail"}.get(data.get("status"), "unknown")
        if overall == "pass" and all(state == "pass" for state in job_states):
            state = "pass"
        elif overall == "fail" or "fail" in job_states:
            state = "fail"
        elif overall == "warn" or "warn" in job_states:
            state = "warn"
        else:
            state = "unknown"
        measured_at = iso(finished) if state != "unknown" else None
        return {"retention": {"state": valid_state(state), "measured_at": measured_at}}
    except (OSError, ValueError, TypeError, OverflowError, AttributeError):
        return {"retention": {"state": "unknown", "measured_at": None}}


def camera_state(item, now=None):
    now = time.time() if now is None else now
    if not isinstance(item, dict):
        return "unknown"
    checked = epoch(item.get("updated_at"))
    recorded = epoch(item.get("last_video_at"))
    if checked is None or recorded is None or not math.isfinite(checked) or not math.isfinite(recorded):
        return "unknown"
    if now - checked < 0 or now - checked > MAX_CACHE_AGE:
        return "unknown"
    if now - recorded < -FUTURE_SKEW or now - recorded > MAX_RECORDING_AGE:
        return "unknown"
    if item.get("status") == "recording" and item.get("recorder_active") is True and item.get("sample_growth") is True:
        return "ok"
    return "unknown"


def nonnegative_number(value):
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    if not math.isfinite(value) or value < 0 or not float(value).is_integer():
        return None
    return value


def filesystem_metrics(item):
    empty = {"used_percent": None, "available_bytes": None}
    if not isinstance(item, dict) or item.get("status") != "ok":
        return empty
    total = nonnegative_number(item.get("total_bytes"))
    available = nonnegative_number(item.get("available_bytes"))
    if total is None or total <= 0 or available is None or available > total:
        return empty
    return {"used_percent": round((total - available) * 100 / total, 1), "available_bytes": int(available)}


def health_metrics(host, updated, now):
    empty_fs = {"used_percent": None, "available_bytes": None}
    empty = {
        "root": empty_fs.copy(), "vol1": empty_fs.copy(),
        "ram": {"available_bytes": None}, "swap": {"used_bytes": None, "total_bytes": None},
    }
    if updated is None or now - updated > MAX_HEALTH_AGE or now - updated < -FUTURE_SKEW:
        return empty

    rows = host.get("filesystems", [])
    filesystems = {item.get("path"): item for item in rows if isinstance(item, dict)} if isinstance(rows, list) else {}
    root = filesystem_metrics(filesystems.get("/"))
    volume = filesystem_metrics(filesystems.get("/vol1"))
    memory = host.get("memory") if isinstance(host.get("memory"), dict) else {}
    ram_available = nonnegative_number(memory.get("available_bytes")) if memory.get("status") == "ok" else None
    ram_total = nonnegative_number(memory.get("total_bytes")) if memory.get("status") == "ok" else None
    if ram_available is None or ram_total is None or ram_total <= 0 or ram_available > ram_total:
        ram_available = None

    # Map only the aggregate swap fields confirmed in the installed cache.
    swap_used = nonnegative_number(memory.get("swap_used_bytes")) if memory.get("status") == "ok" else None
    swap_total = nonnegative_number(memory.get("swap_total_bytes")) if memory.get("status") == "ok" else None
    if swap_used is None or swap_total is None or swap_total <= 0 or swap_used > swap_total:
        swap_used = swap_total = None

    return {
        "root": root,
        "vol1": volume,
        "ram": {"available_bytes": int(ram_available) if ram_available is not None else None},
        "swap": {
            "used_bytes": int(swap_used) if swap_used is not None else None,
            "total_bytes": int(swap_total) if swap_total is not None else None,
        },
    }


def make_snapshot(now=None, cache_path=CACHE, maintenance_path=MAINTENANCE, retention_path=VERIFIED_RETENTION,
                  retention_results_root=VERIFIED_RETENTION_RESULTS):
    now = time.time() if now is None else now
    try:
        source = json.loads(cache_path.read_text(encoding="utf-8"))
        if not isinstance(source, dict):
            raise ValueError("invalid collector cache")
        updated = epoch(source["updated_at"])
        if updated is None or not math.isfinite(updated) or updated > now + FUTURE_SKEW:
            raise ValueError("future cache timestamp")
    except (OSError, ValueError, KeyError, TypeError):
        source, updated = {}, None

    nas_state = "unknown"
    host = source.get("host") if isinstance(source.get("host"), dict) else {}
    health = health_metrics(host, updated, now)
    root, volume = health["root"], health["vol1"]
    if root["used_percent"] is not None and volume["used_percent"] is not None:
        nas_state = "warn" if volume["used_percent"] > 95 else "ok"

    tapo = source.get("tapo") if isinstance(source.get("tapo"), dict) else {}
    cameras = tapo.get("cameras") if isinstance(tapo.get("cameras"), dict) else {}
    snapshot = {
        "schema": 1,
        "updated_at": iso(updated) if updated is not None else None,
        "cam1": {"state": camera_state(cameras.get("cam1"), now)},
        "cam2": {"state": camera_state(cameras.get("cam2"), now)},
        "nas": {"state": nas_state},
        "health": health,
        **read_maintenance(maintenance_path),
        **read_verified_retention(retention_path, retention_results_root),
    }
    validate(snapshot)
    return snapshot


def validate(data):
    assert set(data) == {"schema", "updated_at", "cam1", "cam2", "nas", "health", "maintenance", "retention"}
    assert data["schema"] == 1
    for name in ("cam1", "cam2", "nas"):
        assert set(data[name]) == {"state"} and data[name]["state"] in STATES
    for name in ("maintenance", "retention"):
        assert set(data[name]) == {"state", "measured_at"}
        assert data[name]["state"] in STATES
        assert data[name]["measured_at"] is None or isinstance(data[name]["measured_at"], str)
    assert data["updated_at"] is None or isinstance(data["updated_at"], str)
    assert set(data["health"]) == {"root", "vol1", "ram", "swap"}
    for name in ("root", "vol1"):
        assert set(data["health"][name]) == {"used_percent", "available_bytes"}
        percent = data["health"][name]["used_percent"]
        available = data["health"][name]["available_bytes"]
        assert percent is None or (not isinstance(percent, bool) and isinstance(percent, (int, float)) and math.isfinite(percent) and 0 <= percent <= 100)
        assert available is None or (not isinstance(available, bool) and isinstance(available, int) and available >= 0)
    assert set(data["health"]["ram"]) == {"available_bytes"}
    ram_available = data["health"]["ram"]["available_bytes"]
    assert ram_available is None or (not isinstance(ram_available, bool) and isinstance(ram_available, int) and ram_available >= 0)
    assert set(data["health"]["swap"]) == {"used_bytes", "total_bytes"}
    swap = data["health"]["swap"]
    for value in swap.values():
        assert value is None or (not isinstance(value, bool) and isinstance(value, int) and value >= 0)
    assert (swap["used_bytes"] is None) == (swap["total_bytes"] is None)
    assert swap["total_bytes"] is None or (swap["total_bytes"] > 0 and swap["used_bytes"] <= swap["total_bytes"])
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

        backend = os.environ.get("STATUS_BACKEND", "blob")
        if backend == "gas-drive":
            # Same collector, snapshot allowlist, publisher lock and timer.
            try:
                from scripts.nas_report_transport import load_config, next_sequence, publish
            except ModuleNotFoundError:
                from nas_report_transport import load_config, next_sequence, publish
            config_file = Path(os.environ.get("STATUS_REPORT_CONFIG", "~/.config/homepage-nas/reporting.json")).expanduser()
            config = load_config(config_file)
            sequence = next_sequence(OUTPUT.parent / "report-sequence.json", config["generation"])
            signal.signal(signal.SIGALRM, timeout)
            signal.alarm(25)
            try:
                result = publish(payload, config, sequence)
            finally:
                signal.alarm(0)
            print(json.dumps(result, separators=(",", ":")))
            return 0
        if backend != "blob":
            raise ValueError("Unknown status backend")
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
        code = str(exc) if isinstance(exc, ValueError) and re.fullmatch(r"[A-Z_]{1,64}", str(exc)) else type(exc).__name__
        print(json.dumps({"event": "nas-status-publish", "ok": False, "code": code}), file=sys.stderr)
        raise SystemExit(1)

