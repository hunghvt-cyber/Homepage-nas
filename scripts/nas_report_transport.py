"""Authenticated NAS snapshot transport; stdlib only, no credentials in logs/URLs."""
import hashlib
import hmac
import json
import os
import re
import stat
import tempfile
import time
import uuid
from pathlib import Path
from urllib.error import HTTPError
from urllib.parse import urlparse
from urllib.request import Request, HTTPRedirectHandler, build_opener


def load_config(path):
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
    with os.fdopen(fd, "r", encoding="utf-8") as handle:
        info = os.fstat(handle.fileno())
        if not stat.S_ISREG(info.st_mode) or info.st_uid != os.geteuid() or info.st_mode & 0o077:
            raise ValueError("PRIVATE_CONFIG_REQUIRED")
        config = json.loads(handle.read(8192))
    if set(config) != {"url", "key", "generation"}:
        raise ValueError("INVALID_REPORT_CONFIG")
    u = urlparse(config["url"])
    if (u.scheme != "https" or u.netloc != "script.google.com" or u.query or u.fragment
            or not re.fullmatch(r"/macros/s/[\w-]{20,200}/exec", u.path)):
        raise ValueError("INVALID_REPORT_URL")
    if not re.fullmatch(r"[a-f0-9]{64}", config["key"]):
        raise ValueError("INVALID_REPORT_KEY")
    if str(uuid.UUID(config["generation"])) != config["generation"]:
        raise ValueError("INVALID_REPORT_GENERATION")
    return config


def next_sequence(path, generation):
    """Reserve before sending. Caller holds the existing publisher file lock."""
    path = Path(path)
    if path.exists():
        old = json.loads(path.read_text(encoding="utf-8"))
        if old.get("generation") != generation or type(old.get("sequence")) is not int or old["sequence"] < 1:
            raise ValueError("SEQUENCE_STATE_INVALID")
        sequence = old["sequence"] + 1
    else:
        sequence = 1
    if sequence > 9007199254740991:
        raise ValueError("SEQUENCE_EXHAUSTED")
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, temp = tempfile.mkstemp(prefix="sequence-", dir=path.parent)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            json.dump({"generation": generation, "sequence": sequence}, handle)
            handle.flush()
            os.fsync(handle.fileno())
        os.chmod(temp, 0o600)
        os.replace(temp, path)
        directory = os.open(path.parent, os.O_RDONLY | os.O_DIRECTORY)
        try:
            os.fsync(directory)
        finally:
            os.close(directory)
    finally:
        if os.path.exists(temp):
            os.unlink(temp)
    return sequence


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def request_json(url, body):
    opener = build_opener(NoRedirect)
    req = Request(url, data=body, headers={"Content-Type": "application/json"}, method="POST")
    try:
        response = opener.open(req, timeout=10)
    except HTTPError as error:
        if error.code not in (301, 302, 303):
            raise ValueError("REPORT_HTTP_FAILED") from None
        target = error.headers.get("Location", "")
        error.close()
        u = urlparse(target)
        if u.scheme != "https" or u.netloc != "script.googleusercontent.com":
            raise ValueError("REPORT_REDIRECT_FORBIDDEN")
        # ContentService serves the response with a GET; never resend the signed body.
        response = opener.open(Request(target, method="GET"), timeout=10)
    with response:
        if response.status != 200:
            raise ValueError("REPORT_HTTP_FAILED")
        raw = response.read(16385)
        if len(raw) > 16384:
            raise ValueError("REPORT_RESPONSE_TOO_LARGE")
        return json.loads(raw)


def publish(payload, config, sequence, request=request_json):
    """Returns only verified acknowledgement metadata, never token-bearing raw data."""
    request_id = str(uuid.uuid4())
    message = json.dumps({"version": 1, "op": "publish", "issuedAt": int(time.time() * 1000),
                          "requestId": request_id, "generation": config["generation"],
                          "sequence": sequence, "snapshotText": payload.decode("ascii")}, separators=(",", ":"))
    mac = hmac.new(config["key"].encode(), message.encode(), hashlib.sha256).hexdigest()
    body = json.dumps({"payload": message, "signature": mac}, separators=(",", ":")).encode()
    result = request(config["url"], body)
    signed = result.get("payload")
    if not isinstance(signed, str) or not isinstance(result.get("signature"), str):
        raise ValueError("REPORT_ACK_UNSIGNED")
    expected = hmac.new(config["key"].encode(), signed.encode(), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected, result["signature"]):
        raise ValueError("REPORT_ACK_INVALID")
    ack = json.loads(signed)
    if ack.get("requestId") != request_id:
        raise ValueError("REPORT_ACK_WRONG_REQUEST")
    if ack.get("ok") is not True:
        code = ack.get("code", "REPORT_REJECTED")
        allowed = {"BUSY", "STALE_SEQUENCE", "GENERATION_MISMATCH", "REQUEST_EXPIRED", "IDEMPOTENCY_MISMATCH"}
        raise ValueError(code if code in allowed else "REPORT_REJECTED")
    if ack.get("sequence") != sequence or ack.get("sha256") != hashlib.sha256(payload).hexdigest():
        raise ValueError("REPORT_ACK_WRONG_CONTENT")
    return {"published": True, "backend": "gas-drive", "sequence": sequence, "replay": ack.get("replay") is True}
