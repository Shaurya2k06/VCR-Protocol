import 'dotenv/config';
import { BitGoAPI } from "@bitgo/sdk-api";
import { Eth } from "@bitgo/sdk-coin-eth";

async function run() {
  const bitgo = new BitGoAPI({ env: "test" });
  bitgo.register("hteth", Eth.createInstance);
  bitgo.authenticateWithAccessToken({ accessToken: process.env.BITGO_ACCESS_TOKEN });
  
  const enterpriseId = process.env.BITGO_ENTERPRISE_ID;
  const walletPassphrase = "vcr-agent-passphrase-test1234!";
  
  try {
    console.log("Trying with multisigType: onchain, no walletVersion");
    const result = await bitgo.coin("hteth").wallets().generateWallet({
      label: "Test wallet 123",
      passphrase: walletPassphrase,
      enterprise: enterpriseId,
      multisigType: "onchain",
    } as any);
    console.log("Success! Wallet ID:", result.wallet.id());
  } catch (e) {
    console.error("Failed:", e.message);
  }
}
run();
