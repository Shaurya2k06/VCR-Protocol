// ─── VCR Protocol — Environment Validation ───────────────────────────────────
// Run with: npx tsx src/validate-env.ts
import "dotenv/config";

const required: string[] = [
    "BITGO_ACCESS_TOKEN",
    "BITGO_ENTERPRISE_ID",
    "PINATA_JWT",
    "PINATA_GATEWAY",
    "PIMLICO_API_KEY",
    "PRIVATE_KEY",
    "SEPOLIA_RPC_URL",
    "MONGODB_URI",
];

const optional: string[] = [
    "BITGO_WALLET_ID",
    "BITGO_WALLET_PASSPHRASE",
    "MAINNET_RPC_URL",
    "ALCHEMY_API_KEY",
    "DEMO_RECIPIENT_ADDRESS",
    "VCR_REGISTRY_ADDRESS",
    "BITGO_WEBHOOK_SECRET",
];

console.log("\n🔐 VCR Protocol — Environment Validation\n");
console.log("━".repeat(50));

let hasErrors = false;

// Check required variables
console.log("\n✅ Required Variables:\n");
for (const key of required) {
    const val = process.env[key];
    if (!val) {
        console.log(`   ❌ ${key} — MISSING`);
        hasErrors = true;
    } else {
        // Mask the value for security
        const masked = val.length > 8 ? val.slice(0, 4) + "..." + val.slice(-4) : "***";
        console.log(`   ✅ ${key} = ${masked}`);
    }
}

// Check optional variables
console.log("\n📋 Optional Variables:\n");
for (const key of optional) {
    const val = process.env[key];
    if (!val) {
        console.log(`   ⚠️  ${key} — not set (optional)`);
    } else {
        const masked = val.length > 8 ? val.slice(0, 4) + "..." + val.slice(-4) : "***";
        console.log(`   ✅ ${key} = ${masked}`);
    }
}

console.log("\n" + "━".repeat(50));
if (hasErrors) {
    console.error("\n❌ Missing required environment variables. See above.\n");
    process.exit(1);
} else {
    console.log("\n✅ All required environment variables are set.\n");
}
