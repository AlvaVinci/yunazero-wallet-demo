import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createServer } from '../src/mock_wallet';
import crypto from 'node:crypto';

function sign(body: unknown, secret = 'change-me') {
  return crypto
    .createHmac('sha256', process.env.HMAC_SECRET || secret)
    .update(JSON.stringify(body ?? {}))
    .digest('hex');
}

describe('mock wallet API', () => {
  const app = createServer();

  it('health returns ok', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.mode).toBe('mock');
  });

  it('quote returns lamports amount', async () => {
    const res = await request(app).post('/api/quote').send({ jobId: 'job-1', kind: 'AUDIO_SNIPPET' });
    expect(res.status).toBe(200);
    expect(res.body.currency).toBe('LAMPORTS');
    expect(res.body.amount).toBeGreaterThan(0);
  });

  it('job/complete requires signature', async () => {
    const res = await request(app).post('/api/job/complete').send({ jobId: 'job-2' });
    expect(res.status).toBe(401);
  });

  it('settle denies without whitelist', async () => {
    const body = { jobId: 'job-3', dest: '11111111111111111111111111111111', currency: 'LAMPORTS', amountLamports: 1000 };
    const sig = sign(body);
    const res = await request(app).post('/api/settle').set('x-signature', sig).send(body);
    expect(res.status).toBe(403);
  });

  it('settle succeeds with whitelist', async () => {
    process.env.TREASURY_DEST_WHITELIST = '11111111111111111111111111111111';
    const body = { jobId: 'job-4', dest: '11111111111111111111111111111111', currency: 'LAMPORTS', amountLamports: 1000 };
    const sig = sign(body);
    const res = await request(app).post('/api/settle').set('x-signature', sig).send(body);
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.tx).toMatch(/^SIM_SOL_/);
  });
});
