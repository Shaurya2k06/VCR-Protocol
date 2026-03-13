# @vcr-protocol/sdk

The official SDK for the VCR Protocol. Build policy-bound autonomous agent wallets with on-chain verification, ENS integration, x402 payments, and BitGo enforcement.

## Features

- **Policy Management**: Create, validate, and pin VCR policies to IPFS.
- **Verification Engine**: Check spend requests against local or fetched policies (daily limits, whitelists, etc).
- **ENS Integration (ENSIP-25)**: Link agents and policies to human-readable ENS names.
- **ERC-8004 Support**: Register and manage on-chain agent identities.
- **BitGo Integration**: Create and manage highly secure v3 multisig wallets for agents.
- **x402 Payments**: Integrate with the x402 protocol for agent-to-agent and agent-to-human payments.

## Installation

```bash
npm install @vcr-protocol/sdk
```

## Quick Start

### 1. Verify a Spend Request

```typescript
import { canAgentSpend } from '@vcr-protocol/sdk';

const result = await canAgentSpend("agent.eth", {
  amount: "1000000", // 1 USDC (6 decimals)
  token: "USDC",
  recipient: "0x...",
  chain: "base-sepolia"
}, async (ens, token) => {
  // Return current daily spent from your DB
  return "0"; 
});

if (result.allowed) {
  console.log("Agent is authorized to spend!");
} else {
  console.log("Blocked:", result.reason);
}
```

### 2. Create and Pin a Policy

```typescript
import { createPolicy, pinPolicy } from '@vcr-protocol/sdk';

const policy = createPolicy("eip155:11155111:...", {
  maxTransaction: { amount: "5000000", token: "USDC", chain: "base-sepolia" },
  dailyLimit: { amount: "10000000", token: "USDC", chain: "base-sepolia" },
  allowedRecipients: ["0x..."],
  allowedTokens: ["USDC"],
  allowedChains: ["base-sepolia"]
});

const { cid, ipfsUri } = await pinPolicy(policy);
// Link ipfsUri to your ENS name as a 'vcr.policy' text record
```

## Environment Variables

The SDK requires the following environment variables for certain features:

- `PINATA_JWT` & `PINATA_GATEWAY`: For IPFS operations.
- `SEPOLIA_RPC_URL`: For on-chain lookups and registrations.
- `BITGO_ACCESS_TOKEN`, `BITGO_ENTERPRISE_ID`, `BITGO_WALLET_PASSPHRASE`: For BitGo wallet management.

## Publishing

To publish a new version:

1. Increment version in `package.json`.
2. Run `npm run build`.
3. Run `npm publish --access public`.

## License

MIT
