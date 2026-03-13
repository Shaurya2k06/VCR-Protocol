// ─── VCR Protocol SDK — Contract Addresses & Chain IDs ───────────────────────
// Hard-coded. Never accept these as user input without validation.

export const CONTRACTS = {
  ERC8004: {
    IdentityRegistry: {
      mainnet: "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432" as const,
      sepolia: "0x8004A818BFB912233c491871b3d84c89A494BD9e" as const,
    },
    ReputationRegistry: {
      mainnet: "0x8004BAa17C55a88189AE136b182e5fdA19dE9b63" as const,
      sepolia: "0x8004B663056A597Dffe9eCcC1965A193B7388713" as const,
    },
  },
  ENS: {
    Registry: "0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e" as const,        // same all networks
    UniversalResolver: "0xeEeEEEeE14D718C2B47D9923Deab1335E144EeEe" as const, // same all networks
    PublicResolver: {
      mainnet: "0xF29100983E058B709F3D539b0c765937B804AC15" as const,
      sepolia: "0xE99638b40E4Fff0129D56f03b55b6bbC4BBE49b5" as const,
    },
    NameWrapper: {
      mainnet: "0xD4416b13d2b3a9aBae7AcD5D6C2BbDBE25686401" as const,
    },
  },
  x402: {
    Facilitator: "https://x402.org/facilitator" as const,
  },
  BitGo: {
    TestAPI: "https://app.bitgo-test.com" as const,
  },
} as const;

export const CHAIN_IDS = {
  mainnet:    1,
  sepolia:    11155111,
  hoodi:      560048,   // BitGo testnet — replaces Holesky (Holesky is shut down)
  base:       8453,
  baseSepolia: 84532,
} as const;

export type NetworkName = "mainnet" | "sepolia";
export type ChainName   = keyof typeof CHAIN_IDS;
