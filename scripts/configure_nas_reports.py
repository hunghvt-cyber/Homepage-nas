#!/usr/bin/env python3
"""Run on NAS once. Collect the writer key locally without echoing it."""
import getpass
import json
import os
import tempfile
import uuid
from pathlib import Path
try:
    from scripts.nas_report_transport import load_config
except ModuleNotFoundError:
    from nas_report_transport import load_config


def main():
    path = Path('~/.config/homepage-nas/reporting.json').expanduser()
    if path.exists():
        print('Reporting config already exists; preserved. Use the existing generation and sequence state.')
        return
    config = {'url': input('Apps Script /exec URL: ').strip(),
              'key': getpass.getpass('NAS_REPORT_KEY (hidden): ').strip(),
              'generation': str(uuid.uuid4())}
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, temp = tempfile.mkstemp(prefix='nas-report-', dir=path.parent)
    try:
        with os.fdopen(fd, 'w', encoding='utf-8') as handle:
            json.dump(config, handle)
            handle.flush()
            os.fsync(handle.fileno())
        load_config(temp)
        # Link without replacement; another setup process cannot be overwritten.
        os.link(temp, path)
    finally:
        os.unlink(temp)
    print('Private reporting config saved; no publisher or timer has been changed yet.')


if __name__ == '__main__':
    main()
