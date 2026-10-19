import test from 'node:test';
import assert from 'node:assert/strict';
import {checkAttempts} from '../lib/login-limit.js';
test('retired Blob selector fails closed without accessing storage',async()=>{process.env.LOGIN_LIMIT_BACKEND='blob';await assert.rejects(checkAttempts({headers:{}}),{status:503});});
