import dotenv from 'dotenv';
import process from 'process';

dotenv.config();

const required = [
  'BITGO_ACCESS_TOKEN','BITGO_ENTERPRISE_ID',
  'PINATA_JWT','PINATA_GATEWAY',
  'PRIVATE_KEY','SEPOLIA_RPC_URL'
];
const missing = required.filter(k => !process.env[k]);
if (missing.length) { console.error('MISSING:', missing); process.exit(1); }
console.log('ALL PRESENT');
