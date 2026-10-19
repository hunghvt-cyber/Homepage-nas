import hashlib
import hmac
import json
import os
import tempfile
import unittest
from pathlib import Path
from scripts.nas_report_transport import load_config, next_sequence, publish

KEY = 'a' * 64
GENERATION = '12345678-1234-1234-1234-123456789abc'
CONFIG = {'url': 'https://script.google.com/macros/s/' + 'x' * 30 + '/exec',
          'key': KEY, 'generation': GENERATION}


class ReportTransportTests(unittest.TestCase):
    def test_private_config_and_endpoint_allowlist(self):
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / 'reporting.json'
            path.write_text(json.dumps(CONFIG))
            path.chmod(0o600)
            self.assertEqual(load_config(path), CONFIG)
            path.chmod(0o644)
            with self.assertRaisesRegex(ValueError, 'PRIVATE_CONFIG_REQUIRED'):
                load_config(path)
            path.chmod(0o600)
            for url in ('http://script.google.com/macros/s/' + 'x' * 30 + '/exec',
                        'https://script.google.com.evil.test/macros/s/' + 'x' * 30 + '/exec'):
                path.write_text(json.dumps({**CONFIG, 'url': url}))
                with self.assertRaisesRegex(ValueError, 'INVALID_REPORT_URL'):
                    load_config(path)

    def test_sequence_is_durable_and_reset_is_not_silently_accepted(self):
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / 'sequence.json'
            self.assertEqual(next_sequence(path, GENERATION), 1)
            self.assertEqual(next_sequence(path, GENERATION), 2)
            self.assertEqual(path.stat().st_mode & 0o777, 0o600)
            with self.assertRaisesRegex(ValueError, 'SEQUENCE_STATE_INVALID'):
                next_sequence(path, 'different-generation')

    def test_signed_payload_and_exact_content_ack(self):
        payload = b'{"schema":1,"percent":80.0}\n'
        def request(url, body):
            self.assertEqual(url, CONFIG['url'])
            envelope = json.loads(body)
            self.assertEqual(envelope['signature'], hmac.new(KEY.encode(), envelope['payload'].encode(), hashlib.sha256).hexdigest())
            data = json.loads(envelope['payload'])
            self.assertEqual(data['snapshotText'].encode(), payload)
            self.assertEqual(data['sequence'], 3)
            ack = json.dumps({'ok': True, 'requestId': data['requestId'], 'sequence': 3,
                              'sha256': hashlib.sha256(payload).hexdigest(), 'replay': False})
            return {'payload': ack, 'signature': hmac.new(KEY.encode(), ack.encode(), hashlib.sha256).hexdigest()}
        self.assertEqual(publish(payload, CONFIG, 3, request)['sequence'], 3)

    def test_unsigned_wrong_request_and_wrong_content_do_not_acknowledge(self):
        with self.assertRaisesRegex(ValueError, 'REPORT_ACK_UNSIGNED'):
            publish(b'{}', CONFIG, 1, lambda *_: {'ok': True})
        for failure in ('request', 'content'):
            def request(_url, body):
                data = json.loads(json.loads(body)['payload'])
                ack = json.dumps({'ok': True, 'requestId': 'wrong' if failure == 'request' else data['requestId'],
                                  'sequence': 1, 'sha256': 'wrong'})
                return {'payload': ack, 'signature': hmac.new(KEY.encode(), ack.encode(), hashlib.sha256).hexdigest()}
            with self.assertRaises(ValueError):
                publish(b'{}', CONFIG, 1, request)

    def test_generation_rejection_is_reported_without_raw_error(self):
        def request(_url, body):
            data = json.loads(json.loads(body)['payload'])
            ack = json.dumps({'ok': False, 'requestId': data['requestId'], 'code': 'GENERATION_MISMATCH'})
            return {'payload': ack, 'signature': hmac.new(KEY.encode(), ack.encode(), hashlib.sha256).hexdigest()}
        with self.assertRaisesRegex(ValueError, '^GENERATION_MISMATCH$'):
            publish(b'{}', CONFIG, 1, request)


if __name__ == '__main__':
    unittest.main()
