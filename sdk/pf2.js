import dotenv from 'dotenv';
import { createPublicClient, http, formatEther, parseEther } from 'viem';
import { sepolia } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';

dotenv.config();

const account = privateKeyToAccount(process.env.PRIVATE_KEY);
const client = createPublicClient({ chain: sepolia, transport: http(process.env.SEPOLIA_RPC_URL) });
async function check() {
  const balance = await client.getBalance({ address: account.address });
  console.log('Sepolia ETH balance:', formatEther(balance));
  if (balance < parseEther('0.01')) console.warn('LOW BALANCE — may not cover gas');
}
check();
