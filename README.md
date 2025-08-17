# YunaZero Wallet Demo — Agent↔Agent Settlement (Mock Edition)

An **open-source demo by alvavinci LLC**. This project simulates how AI agents may
autonomously settle tasks/payments in the upcoming **Machine Economy**.
It is **mock-only** (no blockchain dependency) so anyone can run it locally.

## Features
- Minimal Node.js/TypeScript server
- HMAC-signed calls to emulate agent↔agent trust
- Settlement API returning **simulated tx IDs** (no chain)
- Test suite (Vitest + Supertest)
- CI (GitHub Actions), ESLint, Prettier

## Endpoints
- `GET /api/health` → `{ ok, mode: "mock" }`
- `POST /api/quote` → `{ jobId, currency: "LAMPORTS", amount, maxPerTx }`
- `POST /api/job/complete` (HMAC required) → `{ received: true, next: "/api/settle" }`
- `POST /api/settle` (HMAC + whitelist + limits)  
  - LAMPORTS: `{ jobId, dest, currency:"LAMPORTS", amountLamports }`  
  - USDC: `{ jobId, dest, currency:"USDC", amountMinor, mint? }`

## Quick Start
```bash
npm ci
cp .env.example .env  # set HMAC_SECRET if needed
npm run dev           # start server at http://localhost:3001
npm test              # run tests
