import {
  apiClient,
  NodeXProfileSnapshot,
} from './rest';
import {
  EngineStatus,
  PaperWalletSnapshot,
  StrategyConfig,
  StrategyDecision,
  TokenLaunchRecord,
} from '../types';

/**
 * One frontend entry point for initial backend data.
 * Pages consume the shared result from TerminalContext rather than
 * issuing their own mount-time requests.
 */
export interface InitialBackendSnapshot {
  profile: NodeXProfileSnapshot | null;
  paperWallet: PaperWalletSnapshot | null;
  launches: TokenLaunchRecord[] | null;
  engineStatus: EngineStatus | null;
  strategy: { config: StrategyConfig; decisions: StrategyDecision[] } | null;
  errors: string[];
}

async function settle<T>(request: Promise<T>, label: string): Promise<{ value: T | null; error?: string }> {
  try {
    return { value: await request };
  } catch (error) {
    return { value: null, error: `${label}: ${error instanceof Error ? error.message : String(error)}` };
  }
}

export const backendService = {
  async loadInitialData(): Promise<InitialBackendSnapshot> {
    // One authoritative bootstrap request. The persistent WebSocket supplies
    // subsequent position, market and portfolio changes without polling.
    const profile = await settle(apiClient.getProfile(), 'Profile');
    return {
      profile: profile.value,
      paperWallet: null,
      launches: null,
      engineStatus: null,
      strategy: null,
      errors: profile.error ? [profile.error] : [],
    };
  },

  getProfile: () => apiClient.getProfile(),
  getEngineStatus: () => apiClient.getEngineStatus(),
  getPaperWallet: () => apiClient.getPaperWallet(),
  getRecentTokens: (limit = 100) => apiClient.getRecentTokens(limit),
};
