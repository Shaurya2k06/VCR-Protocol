import "dotenv/config";
import { BitGoAPI } from "@bitgo/sdk-api";
import { Eth } from "@bitgo/sdk-coin-eth";

async function main() {
  const accessToken = process.env.BITGO_ACCESS_TOKEN;
  if (!accessToken) throw new Error("BITGO_ACCESS_TOKEN not set");

  const bitgo = new BitGoAPI({ env: "test" });
  bitgo.register("hteth", Eth.createInstance);
  bitgo.authenticateWithAccessToken({ accessToken });

  // Get first wallet
  const wallets = await bitgo.coin("hteth").wallets().list({ limit: 1 });
  if (wallets.wallets.length === 0) {
    console.log("No wallets found");
    return;
  }
  
  const walletId = wallets.wallets[0].id();
  const wallet = await bitgo.coin("hteth").wallets().get({ id: walletId });
  console.log(`Checking policies for wallet ${wallet.id()}`);
  
  const policies = await (wallet as any).getPolicies();
  console.log(JSON.stringify(policies, null, 2));
}

main().catch(console.error);
