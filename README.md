# VCR Protocol — Verifiable Capability Routing

**Policy-Bound Agent Wallets: The Missing Layer Between ERC-8004, ENSIP-25, and x402**
**🏆 Won Triple Track across BitGo, ENS, and Base during EthMumbai 2026**


VCR constrains how autonomous agents can spend funds. ERC-8004 gives agents on-chain identity, x402 gives them HTTP-native payment rails — VCR fills the gap with verifiable spending policies.

## Architecture

```
Agent Owner → VCR Policy JSON → IPFS → CID
Agent Owner → ENS text record vcr.policy = ipfs://<CID>
Agent Owner → ERC-8004 IdentityRegistry → agentId
Service → reads ENS → fetches policy → canAgentSpend() → allow/deny
```

## Quick Start

### Prerequisites

- Node.js ≥ 20
- MongoDB running locally
- API keys (see `.env.example`)

### Server

```bash
cd server
cp .env.example .env  # Fill in your keys
npm install
npm run validate-env  # Verify all env vars
npm run dev           # Start dev server
npm test              # Run 69 unit tests
```

### Client

```bash
cd client
npm install
npm run dev
```

### Contracts

```bash
cd contracts
cp .env.example .env
npm install
npx hardhat compile
npm run deploy  # Deploy VCRPolicyRegistry to Sepolia
```

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/health` | GET | Health check |
| `/api/policy` | POST | Create + pin policy to IPFS |
| `/api/policy/:ensName` | GET | Fetch policy via ENS → IPFS |
| `/api/policy/ens` | PUT | Set ENS text records |
| `/api/verify` | POST | Run `canAgentSpend()` |
| `/api/verify/record` | POST | Record a successful spend |
| `/api/verify/daily/:ensName/:token` | GET | Daily spend lookup |
| `/api/verify/history/:ensName` | GET | Spend history |
| `/api/register` | POST | Register agent on ERC-8004 |
| `/api/register/:agentId` | GET | Agent owner + reputation |
| `/api/register/owner/:address` | GET | Agents by owner |
| `/api/register/:agentId/policy` | PUT | Owner-signed policy update (new IPFS CID + ENS pointer + refreshed rules dDoc snapshot) |
| `/api/register/:agentId/rules` | PUT | Owner-signed rules dDoc update (new IPFS leaf) |
| `/api/documents` | POST | Create a versioned dDoc record (initial CID) |
| `/api/documents/:id/version` | POST | Append a new CID version + set as current |
| `/api/documents/:id/restore` | POST | Restore an older CID as current |
| `/api/wallet` | POST | Create BitGo wallet |
| `/api/wallet/:id` | GET | Wallet details |
| `/api/wallet/:id/policy` | GET/PUT | Wallet policy |
| `/api/wallet/:id/send` | POST | Send transaction |
| `/api/wallet/webhook` | POST | BitGo webhook receiver |
| `/api/demo/content` | GET | VCR-gated paywall |
| `/api/demo/simulate` | POST | Full flow simulation |

## Key Features

- **VCR Policy Schema** — JSON policy with maxTransaction, dailyLimit, allowedRecipients, allowedTokens, allowedChains, timeRestrictions
- **`canAgentSpend()`** — 9-step verification: ENS lookup → IPFS fetch → expiry → amount → recipient → token → chain → time → daily limit
- **ERC-8004 Integration** — On-chain agent registration with EIP-712 wallet binding
- **ENSIP-25** — ERC-7930 encoded agent-registration text records + vcr.policy
- **BitGo Wallet Management** — v3 onchain multisig, velocity limits, whitelist policies
- **x402 Payment** — HTTP 402 paywall with VCR policy check middleware
- **VCRPolicyRegistry** — On-chain policy storage as ENS supplement
- **Daily Spend Tracking** — MongoDB-backed atomic CAS spend recording

## Tech Stack

- **Server**: Express 5, TypeScript, MongoDB/Mongoose, viem
- **Client**: React 19, Vite, TailwindCSS, Framer Motion
- **Blockchain**: Solidity 0.8.20, Hardhat, Sepolia testnet
- **IPFS**: Pinata SDK with deterministic JSON serialization
- **Wallet**: BitGo SDK (v3, onchain multisig, Hoodi testnet)
- **Tests**: Vitest (69 tests across 5 suites)

## Critical Notes (from Reference §2)

- BitGo test OTP = `0000000` (7 zeroes, NOT 6)
- BitGo amounts are in **WEI**, not USD
- BitGo wallet policies lock after **48 hours** — immutable forever
- `JSON.stringify()` is NOT deterministic — use `json-stringify-deterministic`
- x402 V2 uses `PAYMENT-SIGNATURE` (no X- prefix)
- Agent IDs start from **0** (post-increment)
- Hoodi testnet chain ID = **560048** (replaces Holesky)

## License

MIT
