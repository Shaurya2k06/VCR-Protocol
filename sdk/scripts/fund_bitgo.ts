import { createWalletClient, http, parseEther } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import * as dotenv from 'dotenv';
dotenv.config();

async function send() {
  const HOODI_RPC = 'https://rpc.hoodi.ethpandaops.io';
  const FEE_ADDR = '0x92bc87b37f5366b0f4ce83f4087b59c9c4c4e056';
  const PK = process.env.PRIVATE_KEY;
  
  if (!PK) throw new Error('PRIVATE_KEY not set');
  
  const account = privateKeyToAccount(PK as any);
  const client = createWalletClient({
    account,
    chain: {
      id: 560048,
      name: 'Hoodi',
      network: 'hoodi',
      nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
      rpcUrls: { default: { http: [HOODI_RPC] }, public: { http: [HOODI_RPC] } }
    },
    transport: http()
  });

  try {
    const hash = await client.sendTransaction({
      to: FEE_ADDR as any,
      value: parseEther('0.5'),
      kzg: undefined
    } as any);
    console.log('Transaction sent! Hash:', hash);
  } catch(e: any) {
    console.log('Error sending transaction:', e.message);
  }
}
send();
