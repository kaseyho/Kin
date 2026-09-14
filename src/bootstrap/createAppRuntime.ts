import type { KinEnvironment, EnvironmentValues } from '@/config/environment';
import { ConfigurationError, readEnvironment } from '@/config/environment';
import type { KinRepository, StorageAdapter } from '@/data/contracts';
import { createRepository } from '@/data/createRepository';
import type { PremiumService } from '@/services/billing/contracts';
import { createPremiumService } from '@/services/billing';

export type AppRuntime =
  | {
      status: 'ready';
      environment: KinEnvironment;
      repository: KinRepository;
      premiumService: PremiumService;
    }
  | { status: 'configuration-error'; error: ConfigurationError };

interface RuntimeFactories {
  createRepository: (
    storage: StorageAdapter,
    values: EnvironmentValues,
    environment: KinEnvironment,
  ) => KinRepository;
  createPremiumService: (
    storage: StorageAdapter,
    values: EnvironmentValues,
    environment: KinEnvironment,
  ) => PremiumService;
}

const defaultFactories: RuntimeFactories = {
  createRepository: (storage, values) => createRepository(storage, values),
  createPremiumService: (storage, values, environment) => createPremiumService({
    deployment: environment.deployment,
    storage,
    values,
  }),
};

export function createAppRuntime(
  storage: StorageAdapter,
  values: EnvironmentValues = process.env,
  factories: RuntimeFactories = defaultFactories,
): AppRuntime {
  try {
    const environment = readEnvironment(values);
    return {
      environment,
      premiumService: factories.createPremiumService(storage, values, environment),
      repository: factories.createRepository(storage, values, environment),
      status: 'ready',
    };
  } catch (error) {
    if (error instanceof ConfigurationError) return { error, status: 'configuration-error' };
    throw error;
  }
}
