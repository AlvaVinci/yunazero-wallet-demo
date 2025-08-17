// YunaZero Wallet Demo — Agent↔Agent Settlement (Mock Edition)
// Open-source mock-only demo by alvavinci LLC
//
// License: Apache-2.0
// This version removes all real Solana devnet code and only simulates
// agent↔agent settlements with mock transaction IDs.
//
// Tests:
//   RUN_TESTS=1 ts-node mock_wallet.ts
// Server:
//   START_SERVER=1 ts-node mock_wallet.ts

import http from 'node:http';
import crypto from 'node:crypto';
import { URL } from 'node:url';

// ----------------------------
// Env & Config
// ----------------------------
interface Env {
  HMAC_SECRET: string;
  TREASURY_DEST_WHITELIST: string;
  MAX_LAMPORTS_PER_TX: number;
  MAX_USDC_MINOR_PER_TX: number;
  DAILY_TX_LIMIT: number;
  PORT: number;
}

const env: Env = {
  HMAC_SECRET: process.env.HMAC_SECRET || 'change-me',
  TREASURY_DEST_WHITELIST: process.env.TREASURY_DEST_WHITELIST || '',
  MAX_LAMPORTS_PER_TX: Number(process.env.MAX_LAMPORTS_PER_TX || 10_000),
  MAX_USDC_MINOR_PER_TX: Number(process.env.MAX_USDC_MINOR_PER_TX || 100_000),
  DAILY_TX_LIMIT: Number(process.env.DAILY_TX_LIMIT || 50),
  PORT: Number(process.env.PORT || 3001)
};

// ----------------------------
// Helpers
// ----------------------------
function json(res: http.ServerResponse, code: number, body: unknown): void {
  const s = JSON.stringify(body);
  res.writeHead(code, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(s) });
  res.end(s);
}

function parseBody(req: http.IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => { data += c; });
    req.on('end', () => {
      try { resolve(data ? JSON.parse(data) : {}); } catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}

function signHmac(payload: unknown): string {
  const s = JSON.stringify(payload ?? {});
  return crypto.createHmac('sha256', env.HMAC_SECRET).update(s).digest('hex');
}

function verifyHmac(payload: unknown, sig: string | undefined | null): boolean {
  if (!sig) return false;
  try {
    const a = Buffer.from(signHmac(payload));
    const b = Buffer.from(sig);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  } catch { return false; }
}

function isWhitelisted(dest: string): boolean {
  if (!env.TREASURY_DEST_WHITELIST) return false;
  const list = env.TREASURY_DEST_WHITELIST.split(',').map((s) => s.trim()).filter(Boolean);
  return list.includes(dest);
}

// in-memory rate limiter
let _count = 0; let _day = new Date().toDateString();
function rateOK(): boolean {
  const d = new Date().toDateString();
  if (d !== _day) { _day = d; _count = 0; }
  _count += 1;
  return _count <= env.DAILY_TX_LIMIT;
}

function isBase58Like(s: string): boolean {
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(s);
}

// ----------------------------
// Mock chain ops
// ----------------------------
function payLamportsMock(dest: string, lamports: number): string {
  if (!isBase58Like(dest)) { throw new Error('invalid_destination_format'); }
  if (!Number.isInteger(lamports) || lamports <= 0) { throw new Error('invalid_amount'); }
  const rand = crypto.randomBytes(16).toString('hex');
  return `SIM_SOL_${rand}`;
}

function paySplTokenMock(mint: string, dest: string, amountMinor: number): string {
  if (!isBase58Like(mint)) { throw new Error('invalid_mint'); }
  if (!isBase58Like(dest)) { throw new Error('invalid_destination_format'); }
  if (!Number.isInteger(amountMinor) || amountMinor <= 0) { throw new Error('invalid_amount_minor'); }
  const rand = crypto.randomBytes(16).toString('hex');
  return `SIM_USDC_${rand}`;
}

// ----------------------------
// API handlers
// ----------------------------
async function handleHealth(_req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  json(res, 200, { ok: true, service: 'yunazero-wallet-demo', mode: 'mock' });
}

async function handleQuote(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  if (req.method !== 'POST') { json(res, 405, {}); return; }
  const body = await parseBody(req);
  const jobId = String(body?.jobId || '');
  const kind = String(body?.kind || 'AUDIO_SNIPPET');
  if (!jobId) { json(res, 400, { error: 'bad_request', issues: { jobId: 'required' } }); return; }
  const table: Record<string, number> = { AUDIO_SNIPPET: 5000, IMAGE_VARIATION: 7000, EBOOK_PAGE: 6000 };
  const amount = table[kind] ?? table['AUDIO_SNIPPET'];
  json(res, 200, { jobId, currency: 'LAMPORTS', amount, maxPerTx: env.MAX_LAMPORTS_PER_TX });
}

async function handleJobComplete(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  if (req.method !== 'POST') { json(res, 405, {}); return; }
  const body = await parseBody(req);
  const sig = String((req.headers['x-signature'] as string) || '');
  if (!verifyHmac(body, sig)) { json(res, 401, { error: 'invalid_signature' }); return; }
  const jobId = String(body?.jobId || '');
  if (!jobId) { json(res, 400, { error: 'bad_request', issues: { jobId: 'required' } }); return; }
  json(res, 200, { received: true, next: '/api/settle' });
}

async function handleSettle(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  if (req.method !== 'POST') { json(res, 405, {}); return; }
  const body = await parseBody(req);
  const sig = String((req.headers['x-signature'] as string) || '');
  if (!verifyHmac(body, sig)) { json(res, 401, { error: 'invalid_signature' }); return; }

  const jobId = String(body?.jobId || '');
  const dest = String(body?.dest || '');
  const currency = String(body?.currency || 'LAMPORTS');

  if (!jobId) { json(res, 400, { error: 'bad_request', issues: { jobId: 'required' } }); return; }
  if (!dest) { json(res, 400, { error: 'bad_request', issues: { dest: 'required' } }); return; }
  if (!isWhitelisted(dest)) { json(res, 403, { error: 'dest_not_whitelisted' }); return; }
  if (!rateOK()) { json(res, 429, { error: 'daily_limit_reached' }); return; }

  try {
    if (currency === 'LAMPORTS') {
      const amountLamports = Number(body?.amountLamports);
      if (!Number.isFinite(amountLamports)) { json(res, 400, { error: 'bad_request', issues: { amountLamports: 'number_required' } }); return; }
      if (amountLamports > env.MAX_LAMPORTS_PER_TX) { json(res, 429, { error: 'amount_exceeds_max' }); return; }
      const tx = payLamportsMock(dest, Math.trunc(amountLamports));
      json(res, 200, { ok: true, currency: 'LAMPORTS', tx });
      return;
    }
    if (currency === 'USDC') {
      const amountMinor = Number(body?.amountMinor);
      if (!Number.isInteger(amountMinor)) { json(res, 400, { error: 'bad_request', issues: { amountMinor: 'integer_required' } }); return; }
      if (amountMinor > env.MAX_USDC_MINOR_PER_TX) { json(res, 429, { error: 'amount_exceeds_max' }); return; }
      const mint = String(body?.mint || 'MockUSDCMint11111111111111111111111111111');
      const tx = paySplTokenMock(mint, dest, amountMinor);
      json(res, 200, { ok: true, currency: 'USDC', tx });
      return;
    }
    json(res, 400, { error: 'unsupported_currency' });
  } catch (e: any) {
    json(res, 500, { error: 'settlement_failed', message: e?.message || String(e) });
  }
}

// ----------------------------
// HTTP router
// ----------------------------
function createServer(): http.Server {
  return http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
      if (req.method === 'GET' && url.pathname === '/api/health') { await handleHealth(req, res); return; }
      if (url.pathname === '/api/quote') { await handleQuote(req, res); return; }
      if (url.pathname === '/api/job/complete') { await handleJobComplete(req, res); return; }
      if (url.pathname === '/api/settle') { await handleSettle(req, res); return; }
      json(res, 404, { error: 'not_found' });
    } catch (err: any) {
      json(res, 500, { error: 'internal_error', message: err?.message || String(err) });
    }
  });
}

// ----------------------------
// Tests (mock only)
// ----------------------------
function assert(cond: any, msg: string): void { if (!cond) throw new Error(msg); }

function runTests(): void {
  console.log('[TEST] starting');

  // HMAC
  const payload = { jobId: 'job1', dest: 'DEST1', amountLamports: 100 };
  const good = signHmac(payload);
  const bad = signHmac({ jobId: 'job1', dest: 'DEST1', amountLamports: 101 });
  assert(verifyHmac(payload, good) === true, 'HMAC verify ok');
  assert(verifyHmac(payload, bad) === false, 'HMAC mismatch fails');

  // whitelist
  const originalWL = env.TREASURY_DEST_WHITELIST;
  (env as any).TREASURY_DEST_WHITELIST = 'DEST1,DEST2';
  assert(isWhitelisted('DEST1') === true, 'DEST1 whitelisted');
  assert(isWhitelisted('DESTX') === false, 'DESTX not whitelisted');
  (env as any).TREASURY_DEST_WHITELIST = originalWL;

  // rate
  const originalLimit = env.DAILY_TX_LIMIT;
  (env as any).DAILY_TX_LIMIT = 2;
  _count = 0; _day = new Date().toDateString();
  assert(rateOK() === true, 'rate 1 ok');
  assert(rateOK() === true, 'rate 2 ok');
  assert(rateOK() === false, 'rate 3 blocked');
  (env as any).DAILY_TX_LIMIT = originalLimit;

  // mock payments
  const tx1 = payLamportsMock('11111111111111111111111111111111', 10);
  assert(typeof tx1 === 'string' && tx1.startsWith('SIM_SOL_'), 'SOL tx mocked');
  const tx2 = paySplTokenMock('11111111111111111111111111111111', '11111111111111111111111111111111', 1000);
  assert(typeof tx2 === 'string' && tx2.startsWith('SIM_USDC_'), 'USDC tx mocked');

  console.log('[TEST] all passed');
}

// ----------------------------
// Entrypoint
// ----------------------------
if (process.env.RUN_TESTS === '1') {
  runTests();
}

if (process.env.START_SERVER === '1') {
  const server = createServer();
  server.listen(env.PORT, () => {
    console.log(`[server] listening on http://localhost:${env.PORT}`);
  });
}

// Exports
export {
  env,
  verifyHmac,
  signHmac,
  isWhitelisted,
  rateOK,
  payLamportsMock,
  paySplTokenMock,
  handleHealth,
  handleQuote,
  handleJobComplete,
  handleSettle,
  createServer
};
