import { BitGoAPI } from '@bitgo/sdk-api';
import { Eth } from '@bitgo/sdk-coin-eth';
import * as dotenv from 'dotenv';
dotenv.config();

async function testPolicies(w: any, desc: string) {
  console.log('--- Testing rules on ' + desc + ' ---');
  for (const t of ['velocityLimit', 'advancedWhitelist', 'allocationLimit', 'whitelist']) {
    try {
      if (t === 'velocityLimit' || t === 'allocationLimit') {
        await w.createPolicyRule({ id: t+'-rule', type: t, action: {type:'deny'}, condition: {amountString:'1000', timeWindow: 3600}} as any);
      } else {
        await w.createPolicyRule({ id: t+'-rule', type: t, action: {type:'deny'}, condition: {addresses:['0x123']}} as any);
      }
      console.log('  [PASS]', t);
    } catch(e: any) {
      if (!e.message.includes('unsupported rule type') && !e.message.includes('/condition must have required property')) {
        console.log('  [ERR]', t, e.message);
      } else {
         console.log('  [UNSUPPORTED/INVALID]', t, e.message);
      }
    }
  }
}

async function run() {
  const bitgo = new BitGoAPI({ env: 'test' });
  bitgo.register('hteth', Eth.createInstance);
  await bitgo.authenticateWithAccessToken({ accessToken: process.env.BITGO_ACCESS_TOKEN });
  const enterprise = process.env.BITGO_ENTERPRISE_ID;

  const w1 = await bitgo.coin('hteth').wallets().get({ id: '69b4ad88c5e246bcfabbb8b943f59265' });
  await testPolicies(w1, 'v1 onchain');

  const w2 = await bitgo.coin('hteth').wallets().get({ id: '69b4a9134f1baf6e17b0f04d9f923354' });
  await testPolicies(w2, 'v3 tss');
}

run().catch(console.error);
