import { createWalletClient, http, createPublicClient } from "viem";
import { sepolia } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";

export function getEOAWalletClient() {
  const rpcUrl = process.env.SEPOLIA_RPC_URL;
  const privateKey = process.env.PRIVATE_KEY as `0x${string}`;

  if (!rpcUrl || !privateKey)
    throw new Error("SEPOLIA_RPC_URL and PRIVATE_KEY must be set");

  const owner = privateKeyToAccount(privateKey);

  return createWalletClient({
    account: owner,
    chain: sepolia,
    transport: http(rpcUrl),
  });
}

export async function getWalletClient() {
  const rpcUrl = process.env.SEPOLIA_RPC_URL;
  const privateKey = process.env.PRIVATE_KEY as `0x${string}`;
  const pimlicoKey = process.env.PIMLICO_API_KEY;

  if (!rpcUrl || !privateKey)
    throw new Error("SEPOLIA_RPC_URL and PRIVATE_KEY must be set");

  const owner = privateKeyToAccount(privateKey);

  if (pimlicoKey) {
    // Dynamic import — permissionless is an optional peer dependency.
    // If not installed, fall through to regular EOA wallet client.
    try {
      const [
        { toSimpleSmartAccount },
        { createPimlicoClient },
        { createSmartAccountClient },
      ] = await Promise.all([
        // @ts-ignore — permissionless is an optional peer dependency
        import("permissionless/accounts"),
        // @ts-ignore — permissionless is an optional peer dependency
        import("permissionless/clients/pimlico"),
        // @ts-ignore — permissionless is an optional peer dependency
        import("permissionless"),
      ]);

      const publicClient = createPublicClient({ chain: sepolia, transport: http(rpcUrl) });
      const pimlicoUrl = `https://api.pimlico.io/v2/sepolia/rpc?apikey=${pimlicoKey}`;

      const pimlicoClient = createPimlicoClient({
        transport: http(pimlicoUrl),
        entryPoint: {
          address: '0x0000000071727De22E5E9d8BAf0edAc6f37da032',
          version: '0.7',
        }
      });

      const account = await toSimpleSmartAccount({
        client: publicClient,
        owner,
        entryPoint: {
          address: '0x0000000071727De22E5E9d8BAf0edAc6f37da032',
          version: '0.7',
        }
      });

      return createSmartAccountClient({
        account,
        chain: sepolia,
        bundlerTransport: http(pimlicoUrl),
        paymaster: pimlicoClient,
        userOperation: {
          estimateFeesPerGas: async () => {
            return (await pimlicoClient.getUserOperationGasPrice()).fast;
          },
        },
      });
    } catch {
      // permissionless not installed or misconfigured — fall through to EOA
    }
  }

  // Fallback to regular EOA 
  return getEOAWalletClient();
}
