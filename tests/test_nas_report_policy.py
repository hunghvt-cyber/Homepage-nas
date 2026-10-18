import json
import tempfile
import unittest
from pathlib import Path
from scripts.nas_report_policy import tick

CONFIG={'generation':'12345678-1234-1234-1234-123456789abc'}
def payload(minute=0, state='ok', disk=30, ram=100):
    return json.dumps({'updated_at':str(minute), 'cam1':{'state':state},
        'cam2':{'state':'ok'}, 'nas':{'state':'ok'},
        'maintenance':{'state':'pass','measured_at':None},
        'retention':{'state':'unknown','measured_at':None},
        'health':{'root':{'used_percent':disk,'available_bytes':100},
                  'vol1':{'used_percent':50,'available_bytes':200},
                  'ram':{'available_bytes':ram},'swap':{'used_bytes':1,'total_bytes':10}}},
        separators=(',',':')).encode('ascii')

class ReportPolicyTests(unittest.TestCase):
    def test_stable_24_hours_48_sends_timestamp_and_ram_noise_skip(self):
        with tempfile.TemporaryDirectory() as d:
            sent=[]
            def sender(body,config,sequence,request_id):
                sent.append(sequence)
                return {'published':True}
            for minute in range(0,1440,5):
                tick(payload(minute,ram=100+minute%9),CONFIG,d,now=minute*60,sender=sender)
            self.assertEqual(sent,list(range(1,49)))
            self.assertEqual(json.loads((Path(d)/'report-sequence.json').read_text())['sequence'],48)
            self.assertEqual((Path(d)/'report-policy.json').stat().st_mode & 0o777,0o600)

    def test_state_recovery_missing_metric_and_cumulative_disk_changes(self):
        with tempfile.TemporaryDirectory() as d:
            sent=[]
            def sender(body,config,sequence,request_id):
                sent.append(json.loads(body));return {'published':True}
            for body,now in [(payload(),0),(payload(5,disk=30.4),300),
                             (payload(10,disk=30.8),600),(payload(15,disk=31.2),900),
                             (payload(20,state='fail',disk=31.2),1200),
                             (payload(25,disk=31.2,ram=None),1500),
                             (payload(30,disk=31.2),1800)]:
                tick(body,CONFIG,d,now=now,sender=sender)
            self.assertEqual(len(sent),5)

    def test_lost_ack_restart_replays_identical_mutation_then_new_event(self):
        with tempfile.TemporaryDirectory() as d:
            sent=[]
            def lost(body,config,sequence,request_id):
                sent.append((body,sequence,request_id));raise TimeoutError()
            with self.assertRaises(TimeoutError):tick(payload(),CONFIG,d,now=0,sender=lost)
            state=json.loads((Path(d)/'report-policy.json').read_text())
            self.assertIsNone(state['baseline']);self.assertIsNone(state['last_ack'])
            def ack(body,config,sequence,request_id):
                sent.append((body,sequence,request_id));return {'published':True}
            self.assertEqual(tick(payload(1,state='fail'),CONFIG,d,now=30,sender=ack)['reason'],'retry-backoff')
            tick(payload(5,state='fail'),CONFIG,d,now=300,sender=ack)
            self.assertEqual(sent[0],sent[1])
            tick(payload(10,state='fail'),CONFIG,d,now=600,sender=ack)
            self.assertEqual(sent[2][1],2);self.assertNotEqual(sent[2][2],sent[0][2])

    def test_corrupt_or_missing_policy_fails_without_network(self):
        with tempfile.TemporaryDirectory() as d:
            def sender(*args,**kwargs):self.fail('network must not run')
            p=Path(d)/'report-policy.json';p.write_text('{')
            with self.assertRaisesRegex(ValueError,'POLICY_STATE_INVALID'):tick(payload(),CONFIG,d,now=0,sender=sender)
            p.unlink();(Path(d)/'report-sequence.json').write_text('{}')
            with self.assertRaisesRegex(ValueError,'POLICY_STATE_MISSING'):tick(payload(),CONFIG,d,now=0,sender=sender)

    def test_unconfirmed_response_never_advances_baseline(self):
        with tempfile.TemporaryDirectory() as d:
            with self.assertRaisesRegex(ValueError,'REPORT_NOT_CONFIRMED'):
                tick(payload(),CONFIG,d,now=0,sender=lambda *a,**k:{'published':False})
            state=json.loads((Path(d)/'report-policy.json').read_text())
            self.assertIsNone(state['last_ack']);self.assertIsNotNone(state['pending'])

    def test_clock_rollback_requests_heartbeat(self):
        with tempfile.TemporaryDirectory() as d:
            sender=lambda *a,**k:{'published':True}
            tick(payload(),CONFIG,d,now=300,sender=sender)
            self.assertTrue(tick(payload(),CONFIG,d,now=0,sender=sender)['published'])
