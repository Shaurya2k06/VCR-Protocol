# VCR Protocol

# Complete Build Reference

**Policy-Bound Agent Wallets: The Missing Layer Between ERC-8004, ENSIP-25, and x402**

Version 2.0 — March 2026

Compiled from deep research across ERC-8004, ENSIP-25, BitGo SDK, Fileverse, x402, Helia, and viem

Key Sources: [ERC-8004](https://eips.ethereum.org/EIPS/eip-8004) · [ENSIP-25](https://docs.ens.domains/ensip/25) · [BitGo SDK](https://developers.bitgo.com) · [Fileverse](https://github.com/fileverse/agents) · [x402](https://x402.org) · [Helia](https://github.com/ipfs/helia) · [viem](https://viem.sh)

---

## Table of Contents

1. [Executive Summary & Architecture](#1-executive-summary--architecture)
2. [CRITICAL CORRECTIONS vs Original VCR Spec](#2-critical-corrections-vs-original-vcr-spec)
3. [ERC-8004 Complete Reference](#3-erc-8004-complete-reference)
4. [ENSIP-25 & ENS Integration](#4-ensip-25--ens-integration)
5. [BitGo SDK — Wallet & Policy Management](#5-bitgo-sdk--wallet--policy-management)
6. [Fileverse & IPFS Storage](#6-fileverse--ipfs-storage)
7. [x402 Protocol — Payment Layer](#7-x402-protocol--payment-layer)
8. [VCR Policy Schema (Complete)](#8-vcr-policy-schema-complete)
9. [Tech Stack & Dependencies](#9-tech-stack--dependencies)
10. [Hackathon Build Playbook (48-Hour Sprint)](#10-hackathon-build-playbook-48-hour-sprint)
11. [Contract Addresses Quick Reference](#11-contract-addresses-quick-reference)
12. [API Keys & Environment Setup](#12-api-keys--environment-setup)

---

## §1 Executive Summary & Architecture

**VCR = Verifiable Capability Routing** — a protocol layer that constrains how an autonomous agent can spend funds. ERC-8004 gives agents on-chain identity<sup>1</sup>, x402 gives them HTTP-native payment rails<sup>2</sup>, but nothing constrains what an agent is allowed to do with its wallet. VCR fills this gap.

### Three Core Components

- **Policy Schema** — A JSON document pinned to IPFS describing spending constraints (max per-tx, daily limits, allowed recipients, allowed tokens, time windows).
- **ENS Text Records** — ENSIP-25 links the agent's identity to ERC-8004, and a custom `vcr.policy` text record points to the IPFS-hosted policy CID.
- **Verifier Library** — A TypeScript function `canAgentSpend()` that any service can call to check whether a proposed payment is within the agent's policy.

### "The Missing Layer"

ERC-8004 provides agent registration and identity<sup>1</sup>. x402 provides HTTP 402-based payment<sup>2</sup>. But between identity and payment, there is no standard for expressing spending policy. An agent owner cannot say "this agent may spend up to $50/day, only on USDC, only to whitelisted services." VCR introduces this constraint layer — verifiable by any third party, stored on neutral infrastructure (IPFS + ENS).

### Architecture Flow

```text
Agent Owner → defines VCR Policy JSON → pins to IPFS → gets CID
Agent Owner → sets ENS text record vcr.policy = ipfs://<CID>
Agent Owner → registers agent on ERC-8004 IdentityRegistry
Agent Owner → links ENS name via ENSIP-25 agent-registration text record

Service (paywall) → receives x402 payment request from agent
Service → reads agent's ENS → fetches vcr.policy from IPFS → runs canAgentSpend()
canAgentSpend() checks:
  ✓ amount ≤ maxTransaction
  ✓ recipient in allowedRecipients
  ✓ cumulative ≤ dailyLimit
  ✓ token in allowedTokens
  ✓ chain in allowedChains
  ✓ time within allowedHours
If ALL pass → allow x402 payment to proceed
```

> 1. ERC-8004: https://eips.ethereum.org/EIPS/eip-8004
> 2. x402 Protocol: https://x402.org

---

## §2 CRITICAL CORRECTIONS vs Original VCR Spec

The following corrections were identified during deep research. Each has significant impact on implementation.

| # | Component | Original Doc Says | Correct Value | Impact |
|---|-----------|-------------------|---------------|--------|
| 1 | **Fileverse SDK Class** | `AgentClient` with `writeFile` / `readFile` | `Agent` from `@fileverse/agents`. Methods: `create()`, `getFile()`, `update()`, `delete()`. Requires Pinata JWT, Pimlico key, viem account. Uses `setupStorage(namespace)`. | Build will fail if using old class name or methods. |
| 2 | **BitGo Test OTP** | `000000` (6 zeroes) | `0000000` (7 zeroes) | Auth fails silently with wrong OTP. |
| 3 | **BitGo velocityLimit** | Amount implies USD | Amount is in **wei** (base units). 1 ETH = 1e18 wei. | Policy limits off by 10<sup>18</sup> factor. |
| 4 | **BitGo wallet version** | `multisigType: 'tss'` | Use v3 with `multisigType: 'onchain'`. TSS/v6 requires contacting BitGo support. | Wallet creation fails for hackathon accounts. |
| 5 | **ERC-8004 Testnet Addrs** | Mainnet addresses used for testnet | Sepolia Identity: `0x8004A818...BD9e` Reputation: `0x8004B663...8713` | Transactions revert on wrong network. |
| 6 | **ENS Public Resolver** | Single address for all networks | Mainnet: `0xF291...C15` Sepolia: `0xE996...b5` | setText calls fail on wrong resolver. |
| 7 | **ENS Universal Resolver** | Not specified | `0xeEeE...EeEe` (same proxy across all networks) | Needed for cross-chain resolution. |
| 8 | **agentId start** | Starts from 1 | Starts from **0**. Uses post-increment `$._lastId++` | Off-by-one in all agent lookups. |
| 9 | **JSON determinism** | `JSON.stringify` for CID | `JSON.stringify` is NOT deterministic. Use `json-stringify-deterministic` or `@helia/json`. | CID mismatch breaks policy verification. |
| 10 | **x402 V2 headers** | X-PAYMENT format | `PAYMENT-SIGNATURE` (client→server) and `PAYMENT-RESPONSE` (server→client). No X- prefix. | 402 handshake fails with old headers. |
| 11 | **Hoodi testnet** | Holesky referenced | Chain ID **560048**, replaces Holesky (shut down). Faucet: hoodi-faucet.pk910.de | Cannot get test ETH on deprecated chain. |
| 12 | **BitGo 48h policy lock** | Not mentioned | All wallet policies lock 48 hours after creation and become **immutable forever**. | Must plan policies carefully before creating. |

Sources: [Fileverse Agents GitHub](https://github.com/fileverse/agents), [BitGo Developer Docs](https://developers.bitgo.com), [ERC-8004 EIP](https://eips.ethereum.org/EIPS/eip-8004), [ENS Deployments](https://docs.ens.domains/learn/deployments), [x402.org](https://x402.org)

---

## §3 ERC-8004 Complete Reference

ERC-8004 defines an on-chain identity system for autonomous agents<sup>1</sup>. It provides three registries: IdentityRegistry (registration and metadata), ReputationRegistry (feedback), and ValidationRegistry (trust scores).

### Contract Addresses

| Contract | Network | Address |
|----------|---------|---------|
| **IdentityRegistry** | Mainnet | `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432` |
| **IdentityRegistry** | Sepolia | `0x8004A818BFB912233c491871b3d84c89A494BD9e` |
| **ReputationRegistry** | Mainnet | `0x8004BAa17C55a88189AE136b182e5fdA19dE9b63` |
| **ReputationRegistry** | Sepolia | `0x8004B663056A597Dffe9eCcC1965A193B7388713` |

### Registration Flow

Three registration variants exist:

- `register()` — bare registration, no URI, returns agentId
- `register(string agentURI)` — with URI pointing to agent metadata
- `register(string agentURI, bytes metadata)` — with URI and raw metadata bytes

**agentId assignment:** Uses post-increment from 0. First agent gets id=0, second gets id=1, etc.

### Agent URI JSON Schema

```json
{
  "type": "autonomous-agent",
  "name": "Research Assistant v1",
  "description": "Agent that fetches and summarizes research papers",
  "image": "ipfs://bafkrei.../avatar.png",
  "registrations": [
    { "chain": "eip155:11155111", "registry": "0x8004A818...", "agentId": 42 }
  ],
  "services": [
    { "type": "research", "endpoint": "https://agent.example.com/api" }
  ],
  "x402Support": {
    "enabled": true,
    "supportedTokens": ["USDC"],
    "supportedChains": ["base", "base-sepolia"]
  },
  "active": true,
  "supportedTrust": ["erc8004-reputation", "vcr-policy"]
}
```

### setAgentWallet — EIP-712 Specification

Setting an agent's wallet requires an EIP-712 typed signature with a 5-minute deadline maximum:

- **Domain:** `name="ERC8004IdentityRegistry"`, `version="1"`
- **TypeHash:** `AgentWalletSet(uint256 agentId,address newWallet,address owner,uint256 deadline)`
- **Metadata:** `"agentWallet"` is a reserved metadata key

### Registration with viem

```typescript
import { createWalletClient, http, parseAbi } from 'viem';
import { sepolia } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';

const account = privateKeyToAccount('0x...');
const walletClient = createWalletClient({
  account,
  chain: sepolia,
  transport: http('https://eth-sepolia.g.alchemy.com/v2/YOUR_KEY'),
});

const txHash = await walletClient.writeContract({
  address: '0x8004A818BFB912233c491871b3d84c89A494BD9e',
  abi: parseAbi([
    'function register(string memory agentURI) external returns (uint256)'
  ]),
  functionName: 'register',
  args: ['ipfs://bafkrei...'],
});
```

### ReputationRegistry

- `giveFeedback(agentId, score, comment)` — score uses WAD 18-decimal math
- `readFeedback(agentId, index)` — returns individual feedback entry
- `getSummary(agentId)` — returns aggregate score and count
- Self-feedback is blocked (caller cannot rate own agent)

### ValidationRegistry

- Request→response pattern for trust validation
- Response score: 0-100 scale

> 1. ERC-8004: https://eips.ethereum.org/EIPS/eip-8004

---

## §4 ENSIP-25 & ENS Integration

ENSIP-25 defines a standard for linking ENS names to agent registrations<sup>1</sup>. It uses parameterized text record keys that encode both the registry address and agent ID.

### Text Record Key Format

The key follows this pattern:

```text
agent-registration[<ERC-7930 encoded registry>][<agentId>]
```

### ERC-7930 Encoding Example

For mainnet IdentityRegistry `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432` on chain 1<sup>2</sup>:

```text
Step 1: Chain ID 1 → CAIP-2 "eip155:1"
Step 2: ERC-7930 encoding components:
  - 0x00 (ERC-7930 prefix)
  - 0x01 (chain type = EVM)
  - 0x00000101 (chain ID = 1, compact varint)
  - 0x14 (address length = 20 bytes)
  - 8004a169fb4a3325136eb29fa0ceb6d2e539a432 (address bytes)

Result: 0x000100000101148004a169fb4a3325136eb29fa0ceb6d2e539a432
```

Full text record key for agent #42:

```text
agent-registration[0x000100000101148004a169fb4a3325136eb29fa0ceb6d2e539a432][42]
```

### Verification Flow

Both registry AND ENS must match for valid agent-ENS linkage:

- Registry confirms agent ownership (agentId → owner address)
- ENS confirms text record value is "1" (active linkage)
- If either check fails, the agent-ENS link is invalid

### ENS setText with viem

```typescript
import { createWalletClient, http, parseAbi } from 'viem';
import { namehash, normalize } from 'viem/ens';

const RESOLVER = '0xF29100983E058B709F3D539b0c765937B804AC15'; // mainnet
const resolverAbi = parseAbi([
  'function setText(bytes32 node, string calldata key, string calldata value) external',
]);

const node = namehash(normalize('yourname.eth'));
const hash = await walletClient.writeContract({
  address: RESOLVER,
  abi: resolverAbi,
  functionName: 'setText',
  args: [
    node,
    'agent-registration[0x0001000001011480...a432][42]',
    '1',
  ],
});

// Set VCR policy record
const policyHash = await walletClient.writeContract({
  address: RESOLVER,
  abi: resolverAbi,
  functionName: 'setText',
  args: [node, 'vcr.policy', 'ipfs://bafkrei...your-policy-cid'],
});
```

### Multicall for Multiple Records

Set multiple ENS text records in one transaction using the resolver's multicall:

```typescript
const multicallAbi = parseAbi([
  'function multicall(bytes[] calldata data) external returns (bytes[] memory)',
]);

// Encode both setText calls, then wrap in multicall
const encoded1 = encodeFunctionData({ abi: resolverAbi, functionName: 'setText',
  args: [node, 'agent-registration[...][42]', '1'] });
const encoded2 = encodeFunctionData({ abi: resolverAbi, functionName: 'setText',
  args: [node, 'vcr.policy', 'ipfs://bafkrei...'] });

await walletClient.writeContract({
  address: RESOLVER, abi: multicallAbi,
  functionName: 'multicall', args: [[encoded1, encoded2]],
});
```

### ENS Contract Addresses

| Contract | Network | Address |
|----------|---------|---------|
| **ENS Registry** | All | `0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e` |
| **Universal Resolver** | All | `0xeEeEEEeE14D718C2B47D9923Deab1335E144EeEe` |
| **Public Resolver** | Mainnet | `0xF29100983E058B709F3D539b0c765937B804AC15` |
| **Public Resolver** | Sepolia | `0xE99638b40E4Fff0129D56f03b55b6bbC4BBE49b5` |
| **Name Wrapper** | Mainnet | `0xD4416b13d2b3a9aBae7AcD5D6C2BbDBE25686401` |

### Reading ENS Text Records (getEnsText)

```typescript
import { createPublicClient, http } from 'viem';
import { mainnet } from 'viem/chains';
import { normalize } from 'viem/ens';

const publicClient = createPublicClient({
  chain: mainnet,
  transport: http(),
});

// Read VCR policy
const policyUri = await publicClient.getEnsText({
  name: normalize('agent.eth'),
  key: 'vcr.policy',
});
// Returns: "ipfs://bafkrei..."

// Read agent registration
const registration = await publicClient.getEnsText({
  name: normalize('agent.eth'),
  key: 'agent-registration[0x0001...a432][42]',
});
// Returns: "1" if linked
```

> 1. ENSIP-25: https://docs.ens.domains/ensip/25
> 2. ERC-7930: https://eips.ethereum.org/EIPS/eip-7930
> 3. ENS Deployments: https://docs.ens.domains/learn/deployments

---

## §5 BitGo SDK — Wallet & Policy Management

BitGo provides institutional-grade wallet infrastructure<sup>1</sup>. For VCR, BitGo policies serve as the on-chain enforcement layer, while VCR policies serve as the off-chain intent layer verifiable by third parties.

### Package Architecture

- `@bitgo/sdk-api` — Core SDK with wallet management, policy APIs
- `@bitgo/sdk-coin-eth` — Ethereum-specific coin module

### Authentication

- **Test environment OTP:** `0000000` (7 zeroes — NOT 6!)
- **Environment:** `env: 'test'`
- **Base URL:** `https://app.bitgo-test.com`

### Hoodi Testnet

- **Chain ID:** 560048
- **Coin:** `hteth`
- **Faucet:** https://hoodi-faucet.pk910.de

### Wallet Creation

```typescript
import { BitGoAPI } from '@bitgo/sdk-api';
import { Eth } from '@bitgo/sdk-coin-eth';

const bitgo = new BitGoAPI({ env: 'test' });
bitgo.register('eth', Eth.createInstance);
bitgo.register('hteth', Eth.createInstance);

await bitgo.authenticateWithAccessToken({ accessToken: process.env.BITGO_ACCESS_TOKEN });

const wallet = await bitgo.coin('hteth').wallets().generateWallet({
  label: 'VCR Agent Wallet',
  passphrase: process.env.BITGO_WALLET_PASSPHRASE,
  enterprise: process.env.BITGO_ENTERPRISE_ID,
  walletVersion: 3,               // MUST be v3 for hackathon
  multisigType: 'onchain',        // NOT 'tss' — TSS requires support contact
});

// CRITICAL: userKeychain.prv is ONLY returned once — store it securely!
console.log('Wallet ID:', wallet.wallet.id());
console.log('User Key (SAVE THIS):', wallet.userKeychain.prv);
console.log('Pending init:', wallet.wallet.coinSpecific()?.pendingChainInitialization);
```

### Gas Tank

**IMPORTANT:** Enterprise gas tank must be funded before creating wallets. Without gas, wallet initialization transactions will fail.

### Policy APIs (Critical for VCR)

**Old wallet-level policies:**

- `advancedWhitelist` — Address whitelist (allowed recipients)
- `velocityLimit` — Spending cap in **wei** per time window
- `allocationLimit` — Per-transaction maximum

**New enterprise-level policies:**

- Touchpoints / conditions / actions model
- More granular but requires enterprise account setup

**48-HOUR POLICY LOCK WARNING:** All wallet policies lock 48 hours after creation and become **immutable forever**. You cannot modify or remove them after the lock period. Plan policies carefully before wallet creation.

### sendMany — Sending Transactions

```typescript
const result = await wallet.sendMany({
  recipients: [{
    amount: '1000000000000000',    // Amount in WEI as STRING
    address: '0xRecipientAddress',
  }],
  walletPassphrase: process.env.BITGO_WALLET_PASSPHRASE,
});

// Returns txid (if approved) or pendingApproval (if policy-triggered)
console.log('TX ID:', result.txid);
console.log('Pending:', result.pendingApproval);
```

### Forwarder Addresses

For walletVersion 3, forwarder contracts are used for receiving tokens. Each wallet can create multiple forwarder addresses for different use cases.

### Pending Approvals Flow

- When a transaction triggers a policy, it goes to pending approval
- Approvers can approve/reject via API or dashboard
- Webhooks notify on pendingApproval events

### Webhooks

- **transfer** — Triggered on confirmed transfers
- **pendingApproval** — Triggered when policy blocks a transaction
- Verify with HMAC signature in webhook headers

### REST API Reference

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/v2/:coin/wallet` | POST | Create wallet |
| `/api/v2/:coin/wallet/:id` | GET | Get wallet details |
| `/api/v2/:coin/wallet/:id/sendmany` | POST | Send transaction |
| `/api/v2/:coin/wallet/:id/policy` | GET/PUT | Get/set wallet policy |
| `/api/v2/:coin/wallet/:id/webhooks` | POST | Register webhook |
| `/api/v2/pendingapprovals/:id` | PUT | Approve/reject pending |

### VCR ↔ BitGo Mapping

BitGo policy = **on-chain enforcement** (wallet actually blocks the transaction). VCR policy = **off-chain intent layer** (third-party services can verify before accepting payment). Both should mirror each other: VCR policy describes intent, BitGo enforces it.

> 1. BitGo Developer Docs: https://developers.bitgo.com

---

## §6 Fileverse & IPFS Storage

### @fileverse/agents v2.0.1

The Fileverse Agents SDK<sup>1</sup> provides on-chain file management via Smart Accounts and Portal contracts.

- **Class:** `Agent` (NOT `AgentClient`)
- **Constructor:** `chain`, `viemAccount`, `pimlicoAPIKey`, `storageProvider`
- **Storage provider:** `PinataStorageProvider(jwt, gateway)`
- **Setup:** `setupStorage(namespace)` — deploys Safe + Portal on Gnosis/Sepolia

### CRUD Methods

- `create(content, metadata)` — Create new file
- `getFile(fileId)` — Read file by ID
- `update(fileId, content, metadata)` — Update existing file
- `delete(fileId)` — Delete file

**WARNING:** There are NO `writeFile`/`readFile`/`listFiles` methods. These do not exist.

### Storage Model

```text
EOA → Safe Smart Account → Portal Contract → IPFS (Pinata)
```

### Known Limitations

- No encryption support
- Only Gnosis and Sepolia chains
- Only Pinata as storage backend
- Markdown content only
- No `listFiles` method — must track file IDs externally

### Fallback: Direct Pinata SDK

For simpler IPFS pinning (recommended for VCR policy files), use the Pinata SDK<sup>2</sup> directly:

```typescript
import { PinataSDK } from 'pinata';

const pinata = new PinataSDK({
  pinataJwt: process.env.PINATA_JWT,
  pinataGateway: process.env.PINATA_GATEWAY,
});

// Pin JSON (e.g., VCR policy)
const result = await pinata.upload.public.json({
  version: '1.0',
  agentId: 'eip155:11155111:0x8004A818...BD9e:42',
  constraints: { /* ... */ },
});
console.log('CID:', result.cid);   // ipfs://bafkrei...

// Fetch pinned content
const data = await pinata.gateways.public.get(result.cid);

// REST alternative:
// POST https://api.pinata.cloud/pinning/pinJSONToIPFS
// Header: Authorization: Bearer <JWT>
```

### Helia (Modern JS IPFS)

For local IPFS node operations or CID computation<sup>3</sup>:

```typescript
import { createHelia } from 'helia';
import { unixfs } from '@helia/unixfs';
import { json } from '@helia/json';

const helia = await createHelia();
const fs = unixfs(helia);
const j = json(helia);

// Add JSON (deterministic CID)
const cid = await j.add({ version: '1.0', constraints: { /* ... */ } });

// Read back
const data = await j.get(cid);

// UnixFS for raw bytes
const bytes = new TextEncoder().encode('hello');
const fileCid = await fs.addBytes(bytes);
for await (const chunk of fs.cat(fileCid)) {
  console.log(new TextDecoder().decode(chunk));
}
```

### CID Verification & JSON Determinism

- sha256 hash only matches for small files with raw codec
- `JSON.stringify()` is **NOT deterministic** — key order varies across runtimes
- Use `@helia/json`, `json-stringify-deterministic`, or `@ipld/dag-json`
- **For VCR:** Pin policy JSON to IPFS → get CID → store as ENS text record `vcr.policy`

> 1. Fileverse Agents: https://github.com/fileverse/agents
> 2. Pinata Docs: https://docs.pinata.cloud
> 3. Helia: https://github.com/ipfs/helia

---

## §7 x402 Protocol — Payment Layer

x402, developed by Coinbase<sup>1</sup>, enables HTTP 402 Payment Required flows for crypto-native paywalls. It allows agents to pay for API access using on-chain USDC payments authorized via EIP-3009 signatures.

### Protocol Flow (11 Steps)

```text
1.  Client sends GET request to protected resource
2.  Server returns HTTP 402 with PAYMENT-REQUIRED header
    (contains: price, token, recipient, facilitator URL, network)
3.  Client parses payment requirements
4.  Client creates EIP-3009 transferWithAuthorization signature
5.  Client retries request with PAYMENT-SIGNATURE header
6.  Server receives request, extracts PAYMENT-SIGNATURE
7.  Server calls Facilitator /verify endpoint
8.  Facilitator validates signature, checks balance
9.  Server calls Facilitator /settle endpoint
10. Facilitator executes on-chain USDC transfer
11. Server returns HTTP 200 with content + PAYMENT-RESPONSE header
```

### V2 Headers

- `PAYMENT-REQUIRED` — Server → Client (in 402 response)
- `PAYMENT-SIGNATURE` — Client → Server (in retry request)
- `PAYMENT-RESPONSE` — Server → Client (in 200 response)

No X- prefix in V2. Old X-PAYMENT format is deprecated.

### Payment Types

- **exact** — One-time EIP-3009 USDC transferWithAuthorization
- **streaming** — Ongoing payment streams (future)

### EIP-3009 Signature Structure

For USDC transferWithAuthorization:

```typescript
// EIP-3009 typed data
{
  types: {
    TransferWithAuthorization: [
      { name: 'from', type: 'address' },
      { name: 'to', type: 'address' },
      { name: 'value', type: 'uint256' },
      { name: 'validAfter', type: 'uint256' },
      { name: 'validBefore', type: 'uint256' },
      { name: 'nonce', type: 'bytes32' },
    ],
  },
  primaryType: 'TransferWithAuthorization',
  domain: { name: 'USD Coin', version: '2', chainId, verifyingContract: USDC_ADDRESS },
  message: { from, to, value, validAfter, validBefore, nonce },
}
```

### Facilitator APIs

- `POST /verify` — Validates payment signature and checks sender balance
- `POST /settle` — Executes the on-chain transfer
- **Coinbase facilitator:** `https://x402.org/facilitator`

### Supported Networks

- Base, Base Sepolia
- Arbitrum One
- Polygon
- Primary token: USDC

### Integration with VCR

`canAgentSpend()` runs **BEFORE** the agent signs the x402 payment. The flow:

```text
// In x402 client middleware:
// 1. Receive 402 with payment requirements
// 2. Extract amount, recipient, token, chain from PAYMENT-REQUIRED
// 3. Call canAgentSpend(ensName, { amount, recipient, token, chain })
// 4. If allowed → sign EIP-3009 and attach PAYMENT-SIGNATURE
// 5. If denied → reject payment, log reason
```

### Server Middleware

```typescript
import { paymentRequired } from '@x402/server';

// Express middleware
app.get('/premium-content', paymentRequired({
  amount: '100000',  // $0.10 USDC (6 decimals)
  token: 'USDC',
  network: 'base',
  facilitator: 'https://x402.org/facilitator',
}), (req, res) => {
  res.json({ data: 'premium content here' });
});
```

### Client Integration

```typescript
import { withPayment } from '@x402/client';

const response = await withPayment(
  fetch('https://api.example.com/premium-content'),
  { wallet, chain: 'base' }
);
const data = await response.json();
```

> 1. x402 Protocol: https://x402.org

---

## §8 VCR Policy Schema (Complete)

### Full JSON Schema

```json
{
  "version": "1.0",
  "agentId": "eip155:11155111:0x8004A818BFB912233c491871b3d84c89A494BD9e:42",
  "constraints": {
    "maxTransaction": {
      "amount": "1000000",
      "token": "USDC",
      "chain": "base"
    },
    "dailyLimit": {
      "amount": "5000000",
      "token": "USDC",
      "chain": "base"
    },
    "allowedRecipients": [
      "0xServiceA...",
      "0xServiceB..."
    ],
    "allowedTokens": ["USDC", "USDT"],
    "allowedChains": ["base", "ethereum"],
    "timeRestrictions": {
      "timezone": "UTC",
      "allowedHours": [9, 17]
    }
  },
  "metadata": {
    "createdAt": "2026-03-13T00:00:00Z",
    "createdBy": "0xOwnerAddress",
    "description": "Policy for research assistant agent",
    "expiresAt": "2026-06-13T00:00:00Z"
  }
}
```

### canAgentSpend() — TypeScript Implementation

Types and setup:

```typescript
import { createPublicClient, http } from 'viem';
import { mainnet } from 'viem/chains';
import { normalize } from 'viem/ens';

interface SpendRequest {
  amount: string;  token: string;  recipient: string;  chain: string;
}
interface SpendResult { allowed: boolean; reason?: string; }
```

Core verification function:

```typescript
async function canAgentSpend(ensName: string, req: SpendRequest): Promise<SpendResult> {
  // 1. Fetch vcr.policy from ENS text record
  const policyUri = await publicClient.getEnsText({
    name: normalize(ensName), key: 'vcr.policy',
  });
  if (!policyUri) return { allowed: false, reason: 'No VCR policy found' };

  // 2. Fetch policy JSON from IPFS
  const policy = await fetchFromIPFS(policyUri);

  // 3. Check max transaction amount
  if (BigInt(req.amount) > BigInt(policy.constraints.maxTransaction.amount))
    return { allowed: false, reason: 'Exceeds max transaction' };

  // 4. Check allowed recipients
  if (!policy.constraints.allowedRecipients.includes(req.recipient))
    return { allowed: false, reason: 'Recipient not whitelisted' };

  // 5. Check allowed tokens
  if (!policy.constraints.allowedTokens.includes(req.token))
    return { allowed: false, reason: 'Token not allowed' };

  // 6. Check allowed chains
  if (!policy.constraints.allowedChains.includes(req.chain))
    return { allowed: false, reason: 'Chain not allowed' };

  // 7. Check time restrictions
  const hour = new Date().getUTCHours();
  const [start, end] = policy.constraints.timeRestrictions.allowedHours;
  if (hour < start || hour >= end)
    return { allowed: false, reason: 'Outside allowed hours' };

  // 8. Check daily cumulative (requires tracking state)
  const dailySpent = await getDailySpent(ensName, req.token);
  if (BigInt(dailySpent) + BigInt(req.amount)
      > BigInt(policy.constraints.dailyLimit.amount))
    return { allowed: false, reason: 'Daily limit exceeded' };

  return { allowed: true };
}
```

---

## §9 Tech Stack & Dependencies

### Complete package.json Dependencies

```json
{
  "dependencies": {
    "viem": "^2.x",
    "@bitgo/sdk-api": "^1.63.x",
    "@bitgo/sdk-coin-eth": "^25.x",
    "@fileverse/agents": "^2.0.1",
    "pinata": "latest",
    "helia": "^6.x",
    "@helia/unixfs": "^5.x",
    "@helia/json": "latest",
    "multiformats": "latest",
    "json-stringify-deterministic": "latest",
    "@x402/client": "latest",
    "@x402/server": "latest"
  },
  "devDependencies": {
    "typescript": "^5.x",
    "tsx": "latest",
    "vitest": "latest",
    "@types/node": "^20.x"
  }
}
```

### Required API Keys

| Service | Key Name | Where to Get |
|---------|----------|--------------|
| **BitGo** | Access Token | `app.bitgo-test.com` → Settings → API Tokens |
| **BitGo** | Enterprise ID | Dashboard → Enterprise settings |
| **Pinata** | JWT + Gateway URL | `app.pinata.cloud` → API Keys |
| **Pimlico** | API Key | `dashboard.pimlico.io` → Keys |
| **Alchemy/Infura** | RPC API Key | Provider dashboard → Create app → Copy key |
| **ENS** | ENS Name | `app.ens.domains` → Register on Sepolia |

### Runtime Requirements

- **Node.js:** >=20 <23
- **TypeScript:** 5.x with strict mode
- **Package manager:** pnpm recommended

---

## §10 Hackathon Build Playbook (48-Hour Sprint)

### Hour 0–4: Setup

- Create BitGo test account, generate access token
- Create Pinata account, generate JWT
- Create Pimlico account, get API key
- Set up Alchemy/Infura RPC for Sepolia
- Get testnet ETH from Sepolia faucet
- Register ENS name on Sepolia testnet
- Initialize project: `pnpm init && pnpm add viem @bitgo/sdk-api ...`

### Hour 4–12: Core Infrastructure

- Create BitGo wallet (v3, onchain multisig) — **fund gas tank first!**
- Set wallet policies (whitelist, velocity limit) — **48h lock timer starts!**
- Pin VCR policy JSON to IPFS via Pinata
- Register agent on ERC-8004 IdentityRegistry (Sepolia)
- Set ENS text records: agent-registration + vcr.policy

### Hour 12–24: VCR Library

- Define policy JSON schema (TypeScript types)
- Implement `canAgentSpend()` verifier
- Implement ENS text record read/write helpers
- Implement IPFS fetch + CID verification
- Write unit tests for all constraint checks

### Hour 24–36: Integration

- Build x402 server middleware with VCR check
- Build x402 client wrapper that calls `canAgentSpend()` before payment
- End-to-end demo flow: agent → paywall → VCR check → payment → content
- Basic UI showing policy status and transaction log

### Hour 36–48: Polish

- Integration tests with live testnet
- Demo script (recorded or live)
- Presentation slides
- Documentation (README, architecture diagram)

### Key Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| **BitGo 48h policy lock** | Cannot modify policies after lock | Set policies immediately on Day 1; over-allocate limits |
| **Gas tank not funded** | Wallet init transactions fail | Fund gas tank before wallet creation |
| **Pimlico rate limits** | Fileverse operations throttled | Use direct Pinata SDK as fallback |
| **ENS registration delays** | Cannot set text records | Register ENS name in Hour 0; use Sepolia for speed |
| **Testnet faucet dry** | No test ETH for transactions | Use multiple faucets; request in advance |

---

## §11 Contract Addresses Quick Reference

One consolidated table with all addresses needed for the VCR Protocol implementation:

| Contract | Network | Address |
|----------|---------|---------|
| **ERC-8004 IdentityRegistry** | Mainnet | `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432` |
| **ERC-8004 IdentityRegistry** | Sepolia | `0x8004A818BFB912233c491871b3d84c89A494BD9e` |
| **ERC-8004 ReputationRegistry** | Mainnet | `0x8004BAa17C55a88189AE136b182e5fdA19dE9b63` |
| **ERC-8004 ReputationRegistry** | Sepolia | `0x8004B663056A597Dffe9eCcC1965A193B7388713` |
| **ENS Registry** | All | `0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e` |
| **ENS Universal Resolver** | All | `0xeEeEEEeE14D718C2B47D9923Deab1335E144EeEe` |
| **ENS Public Resolver** | Mainnet | `0xF29100983E058B709F3D539b0c765937B804AC15` |
| **ENS Public Resolver** | Sepolia | `0xE99638b40E4Fff0129D56f03b55b6bbC4BBE49b5` |
| **x402 Facilitator (Coinbase)** | Base | `https://x402.org/facilitator` |
| **BitGo Test API** | Test | `https://app.bitgo-test.com` |

Sources: [ERC-8004 EIP](https://eips.ethereum.org/EIPS/eip-8004), [ENS Deployments](https://docs.ens.domains/learn/deployments), [x402.org](https://x402.org), [BitGo Docs](https://developers.bitgo.com)

---

## §12 API Keys & Environment Setup

### .env Template

Copy this template and fill in your values. **Never commit this file to version control.**

```env
# ──────────────────────────────────────────────────
# BitGo
# ──────────────────────────────────────────────────
BITGO_ACCESS_TOKEN=v2x...
BITGO_ENTERPRISE_ID=...
BITGO_WALLET_ID=...
BITGO_WALLET_PASSPHRASE=...

# ──────────────────────────────────────────────────
# Pinata (IPFS)
# ──────────────────────────────────────────────────
PINATA_JWT=...
PINATA_GATEWAY=your-gateway.mypinata.cloud

# ──────────────────────────────────────────────────
# Pimlico (Account Abstraction)
# ──────────────────────────────────────────────────
PIMLICO_API_KEY=...

# ──────────────────────────────────────────────────
# Fileverse
# ──────────────────────────────────────────────────
CHAIN=gnosis
PRIVATE_KEY=0x...

# ──────────────────────────────────────────────────
# RPC Endpoints
# ──────────────────────────────────────────────────
ALCHEMY_API_KEY=...
SEPOLIA_RPC_URL=https://eth-sepolia.g.alchemy.com/v2/...
MAINNET_RPC_URL=https://eth-mainnet.g.alchemy.com/v2/...

# ──────────────────────────────────────────────────
# ENS
# ──────────────────────────────────────────────────
ENS_NAME=youragent.eth
```

### Quick Validation Script

Run this script to verify all environment variables are configured correctly:

```typescript
import 'dotenv/config';

const required = [
  'BITGO_ACCESS_TOKEN', 'BITGO_ENTERPRISE_ID',
  'PINATA_JWT', 'PINATA_GATEWAY',
  'PIMLICO_API_KEY', 'PRIVATE_KEY',
  'SEPOLIA_RPC_URL', 'ENS_NAME',
];

const missing = required.filter(k => !process.env[k]);
if (missing.length) {
  console.error('Missing env vars:', missing.join(', '));
  process.exit(1);
}
console.log('All required environment variables are set.');
```

---

### End of Document

VCR Protocol — Complete Build Reference v2.0, March 2026

Compiled by Perplexity Computer from primary sources.

Key Sources: [ERC-8004](https://eips.ethereum.org/EIPS/eip-8004) · [ENSIP-25](https://docs.ens.domains/ensip/25) · [ERC-7930](https://eips.ethereum.org/EIPS/eip-7930) · [BitGo SDK](https://developers.bitgo.com) · [Fileverse Agents](https://github.com/fileverse/agents) · [x402 Protocol](https://x402.org) · [Helia](https://github.com/ipfs/helia) · [viem](https://viem.sh) · [ENS Deployments](https://docs.ens.domains/learn/deployments) · [Pinata](https://docs.pinata.cloud)
