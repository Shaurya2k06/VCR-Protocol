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

/**
 * Create a Pimlico paymaster client for Hoodi testnet (chain 560048).
 * Used as fallback when BitGo enterprise gas tank is depleted.
 *
 * @param pimlicoApiKey - Pimlico API key for Hoodi testnet
 * @returns Pimlico client configured for Hoodi
 *
 * @throws Error if pimlicoApiKey is not provided
 * @throws Error if permissionless library is not installed
 */
export async function createHoodiPaymasterClient(pimlicoApiKey: string) {
  if (!pimlicoApiKey) {
    throw new Error(
      "Pimlico API key is required to create Hoodi paymaster client",
    );
  }

  try {
    // Dynamic import — permissionless is required for paymaster clients
    const { createPimlicoClient } = await import(
      "permissionless/clients/pimlico"
    );

    const pimlicoUrl = `https://api.pimlico.io/v2/hoodi/rpc?apikey=${pimlicoApiKey}`;

    const pimlicoClient = createPimlicoClient({
      transport: http(pimlicoUrl),
      entryPoint: {
        address: "0x0000000071727De22E5E9d8BAf0edAc6f37da032", // ERC-4337 v0.7 EntryPoint
        version: "0.7",
      },
    });

    return pimlicoClient;
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes("Cannot find module")
    ) {
      throw new Error(
        "permissionless library is required for Hoodi paymaster support. Install via: npm install permissionless",
      );
    }
    throw error;
  }
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
