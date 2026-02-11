import { createConnection } from 'node:net';

import { ethers } from 'ethers';

export const getPubkeyFromHsm = (): Promise<string> => {
  return new Promise((resolve, reject) => {
    const client = createConnection({ path: '/run/hsm-proxy/hsm-proxy.sock' });
    client.on('connect', () => {
      const type = 0x03;
      const length = 0;
      const tlv = Buffer.from([type, (length >> 8) & 0xFF, length & 0xFF]);
      client.write(tlv);
    });
    client.on('data', (data: Buffer) => {
      if (data.length < 3) return;
      const respType = data[0]!;
      const respLength = (data[1]! << 8) | data[2]!;
      if (respType !== 0x00 || respLength !== 65) {
        reject(new Error('Invalid GET_PUBKEY response'));
        client.end();
        return;
      }
      const pubkey = `0x${data.subarray(3, 3 + 65).toString('hex')}`;
      client.end();
      resolve(pubkey);
    });
    client.on('error', reject);
  });
};

export const signHashWithHsm = (hash: string): Promise<string> => {
  return new Promise((resolve, reject) => {
    const client = createConnection({ path: '/run/hsm-proxy/hsm-proxy.sock' });
    client.on('connect', () => {
      const type = 0x02;
      const length = 32;
      const value = ethers.utils.arrayify(hash);
      const tlv = Buffer.concat([Buffer.from([type]), Buffer.from([(length >> 8) & 0xFF, length & 0xFF]), value]);
      client.write(tlv);
    });
    client.on('data', (data: Buffer) => {
      if (data.length < 3) return;
      const respType = data[0]!;
      const respLength = (data[1]! << 8) | data[2]!;
      if (respType !== 0x00 || respLength !== 65) {
        reject(new Error('Invalid SIGN response'));
        client.end();
        return;
      }
      const signature = data.subarray(3, 3 + 65);
      const vRaw = signature[0]!;
      const r = signature.subarray(1, 33);
      const s = signature.subarray(33, 65);
      const v = vRaw + 27;
      const sig = Buffer.concat([r, s, Buffer.from([v])]);
      client.end();
      resolve(`0x${sig.toString('hex')}`);
    });
    client.on('error', reject);
  });
};

// eslint-disable-next-line functional/no-classes
export class HsmSigner extends ethers.Signer {
  private _address: string;

  constructor(address: string) {
    super();
    this._address = address;
  }

  async getAddress(): Promise<string> {
    return this._address;
  }

  async signMessage(message: ethers.Bytes | string): Promise<string> {
    const messageBytes = ethers.utils.arrayify(message);
    const prefixed = [...ethers.utils, 
      ethers.utils.toUtf8Bytes('\u0019Ethereum Signed Message:\n'),
      ethers.utils.toUtf8Bytes(messageBytes.length.toString()),
      messageBytes,
    ];
    const hash = ethers.utils.keccak256(prefixed);
    return signHashWithHsm(hash);
  }

  async signTransaction(_transaction: ethers.utils.Deferrable<ethers.providers.TransactionRequest>): Promise<string> {
    throw new Error('HSM signer does not support transaction signing');
  }

  connect(_provider: ethers.providers.Provider): HsmSigner {
    return new HsmSigner(this._address);
  }
}

export const createHsmSigner = async (expectedAddress?: string): Promise<HsmSigner> => {
  const pubkey = await getPubkeyFromHsm();
  const address = ethers.utils.computeAddress(pubkey);
  if (expectedAddress && address.toLowerCase() !== expectedAddress.toLowerCase()) {
    throw new Error(`HSM address ${address} does not match expected ${expectedAddress}`);
  }
  return new HsmSigner(address);
};
