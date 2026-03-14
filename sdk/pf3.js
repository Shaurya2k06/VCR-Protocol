import dotenv from 'dotenv';
import { BitGoAPI } from '@bitgo/sdk-api';
import { Eth } from '@bitgo/sdk-coin-eth';

dotenv.config();

const bitgo = new BitGoAPI({ env: 'test' });
bitgo.register('hteth', Eth.createInstance);

async function check() {
  try {
    await bitgo.authenticateWithAccessToken({ accessToken: process.env.BITGO_ACCESS_TOKEN });
    const me = await bitgo.me();
    console.log('Authenticated:', me);
  } catch(e) {
    console.error(e);
  }
}
check();
