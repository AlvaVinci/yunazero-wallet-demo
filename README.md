# YunaZero Wallet Demo — Agent↔Agent Settlement (Mock Edition)

An **open-source demo by alvavinci LLC**. This project simulates how AI agents may
autonomously settle tasks/payments in the upcoming **Machine Economy**.
It is **mock-only** (no blockchain dependency) so anyone can run it locally.

⚠️ **Disclaimer**: This project is for **educational and research purposes only**. Do not use in production or for real financial transactions.

## Features
- Minimal Node.js/TypeScript server
- HMAC-signed calls to emulate agent↔agent trust
- Settlement API returning **simulated tx IDs** (no chain)
- Test suite (Vitest + Supertest)
- CI (GitHub Actions), ESLint, Prettier

## Endpoints
- `GET /api/health` → `{ ok, service: "yunazero-wallet-demo", mode: "mock" }`
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
```

## Example Usage
```bash
# Health check
curl http://localhost:3001/api/health

# Request a quote
curl -X POST http://localhost:3001/api/quote \
  -H 'Content-Type: application/json' \
  -d '{"jobId":"job1","kind":"AUDIO_SNIPPET"}'

# Complete a job (with HMAC signature)
curl -X POST http://localhost:3001/api/job/complete \
  -H 'Content-Type: application/json' \
  -H 'x-signature: <hmac>' \
  -d '{"jobId":"job1"}'
```

## License
Licensed under the **Apache-2.0 License**. See [LICENSE](./LICENSE) for details.
