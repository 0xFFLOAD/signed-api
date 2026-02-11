import { type ethers } from 'ethers';

import { createHsmSigner } from './hsm-signer';
import type { Config } from './validation/schema';

export interface State {
  config: Config;
  // We persist the derived Airnode wallet in memory as a performance optimization.
  airnodeWallet: ethers.Signer;
  // The timestamp of when the service was initialized. This can be treated as a "deployment" timestamp.
  deploymentTimestamp: string;
  // Mapping for template ID to their OEV counterparts. The OEV template ID is hashed from the original template ID and
  // is cached for performance reasons.
  templateIdToOevTemplateId: Record<string, string>;
}

let state: State;

export const initializeState = async (config: Config) => {
  state = await getInitialState(config);
  return state;
};

export const getInitialState = async (config: Config): Promise<State> => {
  return {
    config,
    airnodeWallet: await createHsmSigner('0x890ea8ec6d2c2e7f8a32650cb2b923a6afd8bf91'),
    deploymentTimestamp: Math.floor(Date.now() / 1000).toString(),
    templateIdToOevTemplateId: {},
  };
};

export const setState = (newState: State) => {
  state = newState;
};

export const getState = () => {
  return state;
};
