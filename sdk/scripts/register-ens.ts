// ─── ENS Registration + Subdomain Setup — Sepolia ─────────────────────────────
// Registers a .eth name on Sepolia testnet and creates a subdomain for a VCR agent.
//
// Run this BEFORE `npm run setup` if you don't already own an ENS name on Sepolia.
//
// Usage:
//   npm run register-ens
//   npm run register-ens -- --name vcragent --sub researcher-001
//   npm run register-ens -- --name vcragent --sub researcher-001 --owner 0xABCD...1234
//
//   --owner  Optional. Address that will OWN the ENS name & subdomain.
//            Defaults to the PRIVATE_KEY wallet (signer).
//            Useful to register names that belong to another wallet while
//            your signer pays the gas.
//
// What it does:
//   1. Find an available .eth name on Sepolia
//   2. Commit to it (Tx 1) — 60s lock-in period
//   3. Wait minCommitmentAge (~60s on Sepolia)
//   4. Register the name (Tx 2, ~0.003 ETH)
//   5. Create the subdomain via NameWrapper (Tx 3)
//   6. Print the `npm run setup` command to use next
//
// IMPORTANT: The Sepolia ETHRegistrarController uses a struct-based API:
//   makeCommitment({ label, owner, duration, secret, resolver, data, reverseRecord, referrer })
//   register({ label, owner, duration, secret, resolver, data, reverseRecord, referrer })

import "dotenv/config";
import {
  createPublicClient,
  createWalletClient,
  http,
  parseAbi,
  namehash,
  labelhash,
  keccak256,
  formatEther,
  hexToBytes,
  encodeAbiParameters,
  parseAbiParameters,
  zeroHash,
} from "viem";
import { sepolia } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import { normalize } from "viem/ens";
import crypto from "crypto";

// ─── Sepolia Contract Addresses ────────────────────────────────────────────────
const ETH_REGISTRAR_CONTROLLER =
  "0xfb3cE5D01e0f33f41DbB39035dB9745962F1f968" as `0x${string}`;
const NAME_WRAPPER =
  "0x0635513f179D50A207757E05759CbD106d7dFcE8" as `0x${string}`;
const PUBLIC_RESOLVER =
  "0xE99638b40E4Fff0129D56f03b55b6bbC4BBE49b5" as `0x${string}`;
const ENS_REGISTRY =
  "0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e" as `0x${string}`;

// ─── ABIs (sourced from deployed JSON at ensdomains/ens-contracts) ─────────────

// The Sepolia ETHRegistrarController uses a Registration struct for both
// makeCommitment() and register(). Individual-argument signatures do NOT exist.
//
// struct Registration {
//   string    label;
//   address   owner;
//   uint256   duration;
//   bytes32   secret;
//   address   resolver;
//   bytes[]   data;
//   uint8     reverseRecord;   // 0 = none, 1 = eth reverse, 2 = default reverse
//   bytes32   referrer;
// }

const registrarAbi = [
  {
    name: "available",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "label", type: "string" }],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    name: "valid",
    type: "function",
    stateMutability: "pure",
    inputs: [{ name: "label", type: "string" }],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    name: "minCommitmentAge",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "maxCommitmentAge",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "MIN_REGISTRATION_DURATION",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "commitments",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "commitment", type: "bytes32" }],
    outputs: [{ name: "timestamp", type: "uint256" }],
  },
  {
    name: "rentPrice",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "label", type: "string" },
      { name: "duration", type: "uint256" },
    ],
    outputs: [
      {
        name: "price",
        type: "tuple",
        components: [
          { name: "base", type: "uint256" },
          { name: "premium", type: "uint256" },
        ],
      },
    ],
  },
  {
    name: "makeCommitment",
    type: "function",
    stateMutability: "pure",
    inputs: [
      {
        name: "registration",
        type: "tuple",
        components: [
          { name: "label", type: "string" },
          { name: "owner", type: "address" },
          { name: "duration", type: "uint256" },
          { name: "secret", type: "bytes32" },
          { name: "resolver", type: "address" },
          { name: "data", type: "bytes[]" },
          { name: "reverseRecord", type: "uint8" },
          { name: "referrer", type: "bytes32" },
        ],
      },
    ],
    outputs: [{ name: "commitment", type: "bytes32" }],
  },
  {
    name: "commit",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "commitment", type: "bytes32" }],
    outputs: [],
  },
  {
    name: "register",
    type: "function",
    stateMutability: "payable",
    inputs: [
      {
        name: "registration",
        type: "tuple",
        components: [
          { name: "label", type: "string" },
          { name: "owner", type: "address" },
          { name: "duration", type: "uint256" },
          { name: "secret", type: "bytes32" },
          { name: "resolver", type: "address" },
          { name: "data", type: "bytes[]" },
          { name: "reverseRecord", type: "uint8" },
          { name: "referrer", type: "bytes32" },
        ],
      },
    ],
    outputs: [],
  },
] as const;

const nameWrapperAbi = parseAbi([
  "function ownerOf(uint256 id) view returns (address)",
  "function getData(uint256 id) view returns (address owner, uint32 fuses, uint64 expiry)",
  "function setSubnodeRecord(bytes32 parentNode, string label, address owner, address resolver, uint64 ttl, uint32 fuses, uint64 expiry) returns (bytes32 node)",
]);

const ensRegistryAbi = parseAbi([
  "function owner(bytes32 node) view returns (address)",
  "function setOwner(bytes32 node, address owner) external",
  "function setSubnodeRecord(bytes32 node, bytes32 label, address owner, address resolver, uint64 ttl) external",
]);

// ─── Candidate base names (tried in order until one is available) ─────────────
const CANDIDATE_NAMES = [
  "vcragent",
  "vcrprotocol",
  "vcrdemo",
  "vcrtest",
  "agentvault",
  "agentpolicy",
  "vcrlab",
  "agentledger",
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseArgs(argv: string[]) {
  const args = argv.slice(2);
  const get = (flag: string): string | undefined => {
    const i = args.indexOf(flag);
    return i !== -1 ? args[i + 1] : undefined;
  };
  return {
    name:  get("--name"),
    sub:   get("--sub") ?? "researcher-001",
    owner: get("--owner"),
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function progress(msg: string): void {
  process.stdout.write(`\r${msg}                    `);
}

/** node hash for a subdomain: keccak256(parentNode ++ labelhash(label)) */
function computeSubnodeHash(
  parentNode: `0x${string}`,
  label: string,
): `0x${string}` {
  const parentBytes = hexToBytes(parentNode);
  const labelBytes = hexToBytes(labelhash(label) as `0x${string}`);
  const combined = new Uint8Array(parentBytes.length + labelBytes.length);
  combined.set(parentBytes, 0);
  combined.set(labelBytes, parentBytes.length);
  return keccak256(combined);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const { name: forcedName, sub: subdomain, owner: ownerArg } = parseArgs(process.argv);

  // ── Validate env ─────────────────────────────────────────────────────────
  const missingVars: string[] = [];
  if (!process.env.PRIVATE_KEY) missingVars.push("PRIVATE_KEY");
  if (!process.env.SEPOLIA_RPC_URL) missingVars.push("SEPOLIA_RPC_URL");
  if (missingVars.length > 0) {
    console.error(`\n❌  Missing env vars: ${missingVars.join(", ")}\n`);
    process.exit(1);
  }

  // Validate --owner address if provided
  if (ownerArg && !/^0x[0-9a-fA-F]{40}$/.test(ownerArg)) {
    console.error(`\n❌  Invalid --owner address: ${ownerArg}`);
    console.error("    Must be a checksummed or lowercase hex address (0x + 40 hex chars)\n");
    process.exit(1);
  }

  const account = privateKeyToAccount(process.env.PRIVATE_KEY as `0x${string}`);

  // ownerAddress: who OWNS the name. Defaults to signer if --owner not given.
  const ownerAddress = (ownerArg ?? account.address) as `0x${string}`;
  const delegatedOwner = ownerArg !== undefined && ownerArg.toLowerCase() !== account.address.toLowerCase();

  const publicClient = createPublicClient({
    chain: sepolia,
    transport: http(process.env.SEPOLIA_RPC_URL),
  });

  const walletClient = createWalletClient({
    account,
    chain: sepolia,
    transport: http(process.env.SEPOLIA_RPC_URL),
  });

  console.log("\n╔══════════════════════════════════════════════════════╗");
  console.log("║          VCR Protocol — ENS Sepolia Setup            ║");
  console.log("╚══════════════════════════════════════════════════════╝\n");
  console.log(`  Signer  : ${account.address}  (pays gas)`);
  if (delegatedOwner) {
    console.log(`  Owner   : ${ownerAddress}  (--owner flag — will own the ENS name)`);
  }

  const balance = await publicClient.getBalance({ address: account.address });
  console.log(`  Balance : ${formatEther(balance)} ETH (Sepolia)\n`);

  if (balance < 1_000_000_000_000_000n /* 0.001 ETH */) {
    console.error(
      "❌  Insufficient Sepolia ETH.\n" +
        "    Get some from https://sepoliafaucet.com or https://www.alchemy.com/faucets/ethereum-sepolia\n",
    );
    process.exit(1);
  }

  // ── Step 1: Find an available name ───────────────────────────────────────
  const candidates = forcedName ? [forcedName] : CANDIDATE_NAMES;
  let chosenName: string | null = null;
  let isAlreadyOwned = false;

  console.log("  Checking name availability on Sepolia ENS…\n");

  for (const candidate of candidates) {
    const available = await publicClient.readContract({
      address: ETH_REGISTRAR_CONTROLLER,
      abi: registrarAbi,
      functionName: "available",
      args: [candidate],
    });

    if (available) {
      console.log(`  ✅  "${candidate}.eth" is available — will register it`);
      chosenName = candidate;
      break;
    }

    // Check if OUR address already owns it via registry or NameWrapper
    const node = namehash(normalize(`${candidate}.eth`));
    const registryOwner = (await publicClient.readContract({
      address: ENS_REGISTRY,
      abi: ensRegistryAbi,
      functionName: "owner",
      args: [node],
    })) as `0x${string}`;

    let actualOwner = registryOwner;

    if (registryOwner.toLowerCase() === NAME_WRAPPER.toLowerCase()) {
      try {
        const nodeAsBigInt = BigInt(node);
        const [nwOwner] = (await publicClient.readContract({
          address: NAME_WRAPPER,
          abi: nameWrapperAbi,
          functionName: "getData",
          args: [nodeAsBigInt],
        })) as [`0x${string}`, number, bigint];
        actualOwner = nwOwner;
      } catch {
        // getData failed — leave actualOwner as NameWrapper
      }
    }

    if (
      actualOwner.toLowerCase() === account.address.toLowerCase() ||
      actualOwner.toLowerCase() === ownerAddress.toLowerCase()
    ) {
      console.log(
        `  ✅  "${candidate}.eth" is already owned by ${actualOwner} — skipping registration`,
      );
      chosenName = candidate;
      isAlreadyOwned = true;
      break;
    }

    console.log(
      `  ✗  "${candidate}.eth" is taken (owner: ${registryOwner.slice(0, 12)}…)`,
    );
  }

  if (!chosenName) {
    console.error(
      "\n❌  All candidate names are taken.\n" +
        "    Pass a custom name: npm run register-ens -- --name myname\n",
    );
    process.exit(1);
  }

  const baseDomain = `${chosenName}.eth`;
  const fullSubdomain = `${subdomain}.${baseDomain}`;

  console.log(`\n  Base domain : ${baseDomain}`);
  console.log(`  Subdomain   : ${fullSubdomain}`);
  console.log(`  Resolver    : ${PUBLIC_RESOLVER}\n`);

  // ── Step 2: Registration (skip if already owned) ─────────────────────────
  if (!isAlreadyOwned) {
    // 1 year in seconds — must be >= MIN_REGISTRATION_DURATION (28 days)
    const DURATION = BigInt(365 * 24 * 60 * 60);

    // Fetch registration parameters
    const price = (await publicClient.readContract({
      address: ETH_REGISTRAR_CONTROLLER,
      abi: registrarAbi,
      functionName: "rentPrice",
      args: [chosenName, DURATION],
    })) as { base: bigint; premium: bigint };

    const totalCost = price.base + price.premium;
    const paymentWithBuffer = (totalCost * 110n) / 100n; // 10% overpayment buffer

    const minAge = (await publicClient.readContract({
      address: ETH_REGISTRAR_CONTROLLER,
      abi: registrarAbi,
      functionName: "minCommitmentAge",
    })) as bigint;

    console.log(`  Rent price      : ${formatEther(totalCost)} ETH / year`);
    console.log(`  Paying (w/ 10%) : ${formatEther(paymentWithBuffer)} ETH`);
    console.log(`  Min commit age  : ${minAge}s\n`);

    // Generate a random 32-byte secret (MUST be the same for commit + register)
    const secretBytes = crypto.getRandomValues(new Uint8Array(32));
    const secret =
      `0x${Buffer.from(secretBytes).toString("hex")}` as `0x${string}`;

    // Build the Registration struct
    // IMPORTANT: When --owner differs from the signer, we register with owner = signer
    // so the signer keeps temporary ownership of the parent node and can create the
    // subdomain (setSubnodeRecord requires the caller to own the parent). After the
    // subdomain is created, we transfer the parent to --owner via ENS Registry.setOwner().
    const registrationOwner = delegatedOwner ? account.address : ownerAddress;
    const registration = {
      label: chosenName,
      owner: registrationOwner,
      duration: DURATION,
      secret,
      resolver: PUBLIC_RESOLVER,
      data: [] as `0x${string}`[],
      reverseRecord: 0 as number, // uint8: 0 = no reverse record
      referrer: zeroHash, // bytes32: no referrer
    } as const;

    // ── Tx 1: commit ──────────────────────────────────────────────────────
    console.log("  [1/3] Committing to name registration (Tx 1)…");

    const commitment = (await publicClient.readContract({
      address: ETH_REGISTRAR_CONTROLLER,
      abi: registrarAbi,
      functionName: "makeCommitment",
      args: [registration],
    })) as `0x${string}`;

    console.log(`         commitment: ${commitment.slice(0, 20)}…`);

    const commitHash = await walletClient.writeContract({
      address: ETH_REGISTRAR_CONTROLLER,
      abi: registrarAbi,
      functionName: "commit",
      args: [commitment],
    });
    console.log(`         tx: ${commitHash}`);

    await publicClient.waitForTransactionReceipt({ hash: commitHash });
    console.log("         ✅  Commitment confirmed on-chain\n");

    // ── Wait for minCommitmentAge ──────────────────────────────────────────
    // Buffer increased to 15s — Sepolia block times are ~12s so 3s is
    // too tight and causes CommitmentTooNew reverts.
    const BUFFER_S = 15;
    const waitMs = Number(minAge) * 1000 + BUFFER_S * 1000;
    if (waitMs > 2000) {
      console.log(
        `  ⏳  Waiting ${Number(minAge) + BUFFER_S}s (${Number(minAge)}s min + ${BUFFER_S}s buffer) before registration…`,
      );
      const start = Date.now();
      while (Date.now() - start < waitMs) {
        const remaining = Math.ceil((waitMs - (Date.now() - start)) / 1000);
        progress(`  ⏳  ${remaining}s remaining…`);
        await sleep(1000);
      }
      console.log("\n  ✅  Local wait complete\n");
    } else {
      console.log("  ℹ️   minCommitmentAge = 0, proceeding immediately\n");
      await sleep(1000);
    }

    // ── On-chain readiness check ──────────────────────────────────────────
    // Poll the contract to confirm the commitment timestamp is old enough
    // from the chain's perspective (block.timestamp >= commitTs + minAge).
    // This eliminates false starts caused by inconsistent testnet block times.
    console.log("  🔍  Verifying commitment maturity on-chain…");
    const MAX_READINESS_POLLS = 20; // ~60s max extra wait
    for (let i = 0; i < MAX_READINESS_POLLS; i++) {
      const commitTs = (await publicClient.readContract({
        address: ETH_REGISTRAR_CONTROLLER,
        abi: registrarAbi,
        functionName: "commitments",
        args: [commitment],
      })) as bigint;

      if (commitTs === 0n) {
        // Commitment was already consumed or never stored — proceed
        // (this can happen if the commit was replayed or already registered)
        console.log("  ⚠️   Commitment not found on-chain (may have expired). Proceeding anyway…\n");
        break;
      }

      const latestBlock = await publicClient.getBlock({ blockTag: "latest" });
      const blockTs = latestBlock.timestamp;
      const readyAt = commitTs + minAge;

      if (blockTs >= readyAt) {
        console.log(
          `  ✅  Commitment is mature (block.timestamp ${blockTs} >= readyAt ${readyAt})\n`,
        );
        break;
      }

      const gap = Number(readyAt - blockTs);
      if (i === MAX_READINESS_POLLS - 1) {
        throw new Error(
          `Commitment still too new after ${MAX_READINESS_POLLS} polls. ` +
          `block.timestamp=${blockTs}, readyAt=${readyAt}, gap=${gap}s. ` +
          `Try again in a few seconds.`,
        );
      }

      progress(`  ⏳  Commitment not yet mature (${gap}s to go), polling again in 3s…`);
      await sleep(3000);
    }

    // ── Tx 2: register ────────────────────────────────────────────────────
    console.log("  [2/3] Registering name on Sepolia ENS (Tx 2)…");

    const registerHash = await walletClient.writeContract({
      address: ETH_REGISTRAR_CONTROLLER,
      abi: registrarAbi,
      functionName: "register",
      args: [registration],
      value: paymentWithBuffer,
    });
    console.log(`         tx: ${registerHash}`);

    const registerReceipt = await publicClient.waitForTransactionReceipt({
      hash: registerHash,
    });
    console.log(
      `         ✅  "${baseDomain}" registered! Gas used: ${registerReceipt.gasUsed.toLocaleString()}\n`,
    );
  }

  // ── Step 3: Check / create subdomain ─────────────────────────────────────
  const parentNode = namehash(normalize(baseDomain)) as `0x${string}`;
  const subnodeHex = computeSubnodeHash(parentNode, subdomain);

  const subnodeOwnerInRegistry = (await publicClient.readContract({
    address: ENS_REGISTRY,
    abi: ensRegistryAbi,
    functionName: "owner",
    args: [subnodeHex],
  })) as `0x${string}`;

  const subdomainExists =
    subnodeOwnerInRegistry !== "0x0000000000000000000000000000000000000000";

  // ── Detect whether the parent is wrapped in the NameWrapper ──────────────
  // The Sepolia v3 ETHRegistrarController does NOT wrap names in the
  // NameWrapper — it sets the ENS Registry owner directly to the user's
  // wallet via ens.setRecord(). Calling NameWrapper.setSubnodeRecord on an
  // unwrapped parent throws Unauthorised(bytes32,address) (0xb455aae8).
  //
  //   Wrapped   → ENS Registry owner of parent == NameWrapper address
  //               → use NameWrapper.setSubnodeRecord(parentNode, string label, …)
  //   Unwrapped → ENS Registry owner of parent == user wallet
  //               → use ENS Registry.setSubnodeRecord(parentNode, bytes32 labelhash, …)
  let parentRegistryOwner = (await publicClient.readContract({
    address: ENS_REGISTRY,
    abi: ensRegistryAbi,
    functionName: "owner",
    args: [parentNode],
  })) as `0x${string}`;

  // If we just registered the name, the RPC may take a few seconds to
  // reflect the new owner in the ENS Registry. Poll until it's set.
  let pollCount = 0;
  while (
    parentRegistryOwner === "0x0000000000000000000000000000000000000000" &&
    pollCount < 10
  ) {
    console.log("  ⏳  Waiting for parent ENS owner to sync on-chain...");
    await sleep(3000);
    parentRegistryOwner = (await publicClient.readContract({
      address: ENS_REGISTRY,
      abi: ensRegistryAbi,
      functionName: "owner",
      args: [parentNode],
    })) as `0x${string}`;
    pollCount++;
  }

  const parentIsWrapped =
    parentRegistryOwner.toLowerCase() === NAME_WRAPPER.toLowerCase();

  console.log(`         Parent ENS owner : ${parentRegistryOwner}`);
  console.log(
    `         Parent is wrapped: ${parentIsWrapped ? "yes (NameWrapper)" : "no (direct — will use ENS Registry)"}`,
  );

  let shouldWriteSubdomain = !subdomainExists;
  let subdomainAction = "created";

  if (subdomainExists) {
    let currentOwner = subnodeOwnerInRegistry;

    if (subnodeOwnerInRegistry.toLowerCase() === NAME_WRAPPER.toLowerCase()) {
      try {
        const [wrappedOwner] = (await publicClient.readContract({
          address: NAME_WRAPPER,
          abi: nameWrapperAbi,
          functionName: "getData",
          args: [BigInt(subnodeHex)],
        })) as [`0x${string}`, number, bigint];
        currentOwner = wrappedOwner;
      } catch {
        // keep registry owner when NameWrapper data cannot be read
      }
    }

    console.log(
      `  ℹ️   Subdomain "${fullSubdomain}" already exists (current owner: ${currentOwner})`,
    );

    if (currentOwner.toLowerCase() === ownerAddress.toLowerCase()) {
      console.log(
        "  ✅  Existing subdomain already has the requested owner — no update needed\n",
      );
      shouldWriteSubdomain = false;
    } else {
      console.log(
        `  [3/3] Updating subdomain owner to ${ownerAddress} (Tx 3)…`,
      );
      shouldWriteSubdomain = true;
      subdomainAction = "updated";
    }
  } else {
    console.log(`  [3/3] Creating subdomain "${fullSubdomain}" (Tx 3)…`);
  }

  if (shouldWriteSubdomain) {
    // Guard: signer must own the parent to call setSubnodeRecord.
    // If the parent is already owned by --owner (e.g. after a partial-failure re-run)
    // and the signer is different, we cannot proceed automatically.
    if (
      delegatedOwner &&
      !parentIsWrapped &&
      parentRegistryOwner.toLowerCase() === ownerAddress.toLowerCase() &&
      parentRegistryOwner.toLowerCase() !== account.address.toLowerCase()
    ) {
      console.error(
        `\n❌  Cannot create subdomain: "${baseDomain}" is owned by ${ownerAddress}\n` +
        `    but the signer (${account.address}) is different and lacks permission.\n\n` +
        `    To complete setup, call setSubnodeRecord from the --owner wallet:\n\n` +
        `    ENS Registry: ${ENS_REGISTRY}\n` +
        `    Function:     setSubnodeRecord(\n` +
        `                    parentNode: ${parentNode},\n` +
        `                    label:      ${labelhash(subdomain)},\n` +
        `                    owner:      ${ownerAddress},\n` +
        `                    resolver:   ${PUBLIC_RESOLVER},\n` +
        `                    ttl:        0\n` +
        `                  )\n`,
      );
      process.exit(1);
    }

    let subTxHash: `0x${string}`;

    if (parentIsWrapped) {
      // ── Wrapped path: NameWrapper.setSubnodeRecord ───────────────────────
      // Expiry 1 year from now (as uint64) — must not exceed parent expiry.
      const expiryTimestamp = BigInt(
        Math.floor(Date.now() / 1000) + 365 * 24 * 60 * 60,
      );

      subTxHash = await walletClient.writeContract({
        address: NAME_WRAPPER,
        abi: nameWrapperAbi,
        functionName: "setSubnodeRecord",
        args: [
          parentNode,
          subdomain,
          ownerAddress,    // owner — may differ from signer when --owner is set
          PUBLIC_RESOLVER, // resolver
          0n, // TTL
          0, // fuses: none burned
          expiryTimestamp, // expiry: 1 year
        ],
      });
    } else {
      // ── Unwrapped path: ENS Registry.setSubnodeRecord ────────────────────
      // The ENS Registry takes a bytes32 labelhash, not a string label.
      // No fuses or expiry — plain ENS subdomain record.
      // The caller must be the ENS Registry owner of parentNode (our wallet).
      subTxHash = await walletClient.writeContract({
        address: ENS_REGISTRY,
        abi: ensRegistryAbi,
        functionName: "setSubnodeRecord",
        args: [
          parentNode,
          labelhash(subdomain) as `0x${string}`, // bytes32 labelhash of the subdomain label
          ownerAddress,    // owner — may differ from signer when --owner is set
          PUBLIC_RESOLVER, // resolver
          0n, // TTL
        ],
      });
    }

    console.log(`         tx: ${subTxHash}`);

    const subReceipt = await publicClient.waitForTransactionReceipt({
      hash: subTxHash,
    });
    console.log(
      `         ✅  Subdomain ${subdomainAction}! Gas used: ${subReceipt.gasUsed.toLocaleString()}\n`,
    );
  }

  // ── Transfer parent to --owner (if delegated) ─────────────────────────────
  // When --owner differs from the signer we registered with owner=signer so we
  // could create the subdomain. Now hand the parent node over to --owner.
  if (delegatedOwner && !isAlreadyOwned) {
    console.log(
      `  [4/4] Transferring "${baseDomain}" ownership to --owner (Tx 4)…`,
    );
    const transferHash = await walletClient.writeContract({
      address: ENS_REGISTRY,
      abi: ensRegistryAbi,
      functionName: "setOwner",
      args: [parentNode, ownerAddress],
    });
    console.log(`         tx: ${transferHash}`);
    await publicClient.waitForTransactionReceipt({ hash: transferHash });
    console.log(
      `         ✅  "${baseDomain}" ownership transferred to ${ownerAddress}\n`,
    );
  }


  // ── Ownership verification ────────────────────────────────────────────────
  const finalOwner = (await publicClient.readContract({
    address: ENS_REGISTRY,
    abi: ensRegistryAbi,
    functionName: "owner",
    args: [subnodeHex],
  })) as `0x${string}`;

  console.log(`  Registry owner of "${fullSubdomain}": ${finalOwner}`);

  if (finalOwner.toLowerCase() === ownerAddress.toLowerCase()) {
    const ownerLabel = delegatedOwner ? `--owner address (${ownerAddress.slice(0, 10)}…)` : "your signer key";
    console.log(
      `  ✅  Direct ownership confirmed — setText() will work from ${ownerLabel}\n`,
    );
  } else if (finalOwner.toLowerCase() === NAME_WRAPPER.toLowerCase()) {
    // Wrapped — confirm NameWrapper ownership
    try {
      const [nwOwner] = (await publicClient.readContract({
        address: NAME_WRAPPER,
        abi: nameWrapperAbi,
        functionName: "getData",
        args: [BigInt(subnodeHex)],
      })) as [`0x${string}`, number, bigint];

      if (nwOwner.toLowerCase() === ownerAddress.toLowerCase()) {
        const ownerLabel = delegatedOwner ? `--owner address (${ownerAddress.slice(0, 10)}…)` : "your signer key";
        console.log(
          `  ✅  Wrapped ownership confirmed — setText() will work from ${ownerLabel}\n`,
        );
      } else {
        console.warn(
          `  ⚠️   NameWrapper owner is ${nwOwner}, expected ${ownerAddress}`,
        );
        console.warn(
          "     setText() may fail — check NameWrapper approval status\n",
        );
      }
    } catch (e) {
      console.warn(
        `  ⚠️   NameWrapper getData failed: ${(e as Error).message}\n`,
      );
    }
  } else {
    console.warn(
      `  ⚠️   Unexpected registry owner: ${finalOwner}\n` +
        "     setText() may fail — unexpected ownership state\n",
    );
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log("╔══════════════════════════════════════════════════════╗");
  console.log("║              ✅  ENS Setup Complete                  ║");
  console.log("╚══════════════════════════════════════════════════════╝\n");
  console.log(`  Base domain : ${baseDomain}`);
  console.log(`  Subdomain   : ${fullSubdomain}`);
  console.log(`  Signer      : ${account.address}  (paid gas)`);
  console.log(`  Owner       : ${ownerAddress}${delegatedOwner ? "  (--owner)" : "  (signer)"}\n`);
  console.log("  ─── Run the agent setup next: ────────────────────────\n");
  console.log(`  npm run setup -- \\`);
  console.log(`    --name ${subdomain} \\`);
  console.log(`    --domain ${baseDomain} \\`);
  console.log(`    --max-tx 500 \\`);
  console.log(`    --daily 5000 \\`);
  console.log(`    --recipient ${ownerAddress} \\`);
  console.log(`    --description "VCR demo agent"\n`);
  console.log(
    "  ⚠️   Add ALL recipient addresses now — BitGo policy locks after 48h.\n",
  );
}

main().catch((err) => {
  const msg = (err as Error).message ?? String(err);
  console.error(`\n❌  ENS setup failed: ${msg}`);

  if (msg.includes("74480cc9") || msg.includes("CommitmentTooNew")) {
    console.error(
      "   💡  CommitmentTooNew — the commitment hasn't matured on-chain yet.\n" +
      "       The minCommitmentAge window has not elapsed from the chain's perspective.\n" +
      "       Just re-run the script — it will re-commit and wait longer.\n",
    );
  } else if (msg.includes("CommitmentTooOld") || msg.includes("256e2216")) {
    console.error(
      "   💡  CommitmentTooOld — the commitment expired (>24h). Re-run the script.\n",
    );
  } else if (msg.includes("InsufficientValue")) {
    console.error(
      "   💡  Not enough ETH sent for registration. Check your balance.\n",
    );
  } else if (msg.includes("NameNotAvailable")) {
    console.error(
      "   💡  Name is no longer available. Try another name with --name <label>\n",
    );
  } else if (msg.includes("UnexpiredCommitmentExists")) {
    console.error(
      "   💡  An unexpired commitment already exists. Wait for it to expire (~24h) or re-run after the commitment age window.\n",
    );
  } else if (msg.includes("DurationTooShort")) {
    console.error(
      "   💡  Registration duration is too short. Minimum is 28 days.\n",
    );
  }

  process.exit(1);
});
