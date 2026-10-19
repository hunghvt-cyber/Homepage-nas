"""Event/30-minute heartbeat policy, inside the existing publisher flock.

No network/sequence allocation for skipped checks. An uncertain request keeps
its UUID, sequence and exact snapshot across retries and process restarts.
"""
import json
import math
import os
import tempfile
import time
import uuid
from pathlib import Path
try:
    from scripts.nas_report_transport import next_sequence, publish
except ModuleNotFoundError:
    from nas_report_transport import next_sequence, publish


def atomic_state(path, value):
    path = Path(path)
    fd, temp = tempfile.mkstemp(prefix='report-state-', dir=path.parent)
    try:
        with os.fdopen(fd, 'w', encoding='utf-8') as handle:
            json.dump(value, handle, separators=(',', ':'), allow_nan=False)
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


def changed(current, baseline):
    for key in ('cam1', 'cam2', 'nas', 'maintenance', 'retention'):
        if current[key] != baseline[key]:
            return True
    # Missing measurement and recovery are events, even without a state change.
    for group, metrics in current['health'].items():
        for key, value in metrics.items():
            before = baseline['health'][group][key]
            if (value is None) != (before is None):
                return True
            if key == 'used_percent' and value is not None and abs(value-before) >= 1:
                return True
    return (current['updated_at'] is None) != (baseline['updated_at'] is None)


def tick(payload, config, directory, now=None, sender=publish):
    now = time.time() if now is None else now
    directory = Path(directory)
    path = directory / 'report-policy.json'
    snapshot = json.loads(payload)
    if path.exists():
        try:
            state = json.loads(path.read_text(encoding='utf-8'))
            if (state['version'] != 1 or state['generation'] != config['generation']
                    or type(state['failures']) is not int or state['failures'] < 0):
                raise ValueError()
            baseline, last_ack = state['baseline'], state['last_ack']
            pending = state['pending']
            if baseline is not None:
                changed(snapshot, baseline)  # Validate structural compatibility.
            if last_ack is not None and (type(last_ack) not in (int, float) or not math.isfinite(last_ack)):
                raise ValueError()
            if ((baseline is None) != (last_ack is None)
                    or type(state['retry_after']) not in (int, float)
                    or not math.isfinite(state['retry_after'])):
                raise ValueError()
            if not (directory / 'report-sequence.json').exists():
                raise ValueError()
            if pending is not None:
                if (str(uuid.UUID(pending['request_id'])) != pending['request_id']
                        or type(pending['sequence']) is not int or pending['sequence'] < 1
                        or not isinstance(pending['payload'], str)):
                    raise ValueError()
                changed(snapshot, json.loads(pending['payload']))
        except (ValueError, KeyError, TypeError, AttributeError):
            raise ValueError('POLICY_STATE_INVALID') from None
    else:
        if (directory / 'report-sequence.json').exists():
            raise ValueError('POLICY_STATE_MISSING')
        state = {'version':1, 'generation':config['generation'], 'baseline':None,
                 'last_ack':None, 'pending':None, 'failures':0, 'retry_after':0}
    if state['pending'] is None:
        due = state['last_ack'] is None or now < state['last_ack'] or now-state['last_ack'] >= 1800
        if not due and not changed(snapshot, state['baseline']):
            return {'published':False, 'reason':'unchanged'}
        sequence = next_sequence(directory / 'report-sequence.json', config['generation'])
        state['pending'] = {'sequence':sequence, 'request_id':str(uuid.uuid4()),
                            'payload':payload.decode('ascii')}
        # Persist identity before sending. A crash can skip a sequence but never reuse it.
        atomic_state(path, state)
    elif now < state.get('retry_after', 0):
        return {'published':False, 'reason':'retry-backoff'}
    pending = state['pending']
    try:
        result = sender(pending['payload'].encode('ascii'), config, pending['sequence'],
                        request_id=pending['request_id'])
        if result.get('published') is not True:
            raise ValueError('REPORT_NOT_CONFIRMED')
    except Exception:
        state['failures'] += 1
        delay = (60, 120, 300, 900)[min(state['failures']-1, 3)]
        state['retry_after'] = now + delay
        atomic_state(path, state)
        raise
    state.update(baseline=json.loads(pending['payload']), last_ack=now, pending=None,
                 failures=0, retry_after=0)
    atomic_state(path, state)
    return result
