import {
  apiClient,
  NodeXProfileSnapshot,
} from './api';
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
    const [profile, paperWallet, launches, engineStatus, strategy] = await Promise.all([
      settle(apiClient.getProfile(), 'Profile'),
      settle(apiClient.getPaperWallet(), 'Paper wallet'),
      settle(apiClient.getRecentTokens(100), 'Recent launches'),
      settle(apiClient.getEngineStatus(), 'Engine status'),
      settle(apiClient.getStrategy(), 'Trading configuration'),
    ]);

    return {
      profile: profile.value,
      paperWallet: paperWallet.value,
      launches: launches.value,
      engineStatus: engineStatus.value,
      strategy: strategy.value,
      errors: [profile, paperWallet, launches, engineStatus, strategy]
        .flatMap((result) => result.error ? [result.error] : []),
    };
  },

  getProfile: () => apiClient.getProfile(),
  getEngineStatus: () => apiClient.getEngineStatus(),
  getPaperWallet: () => apiClient.getPaperWallet(),
  getRecentTokens: (limit = 100) => apiClient.getRecentTokens(limit),
};
