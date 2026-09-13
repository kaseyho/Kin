import type { MemoryItem } from './models';

export const FREE_MEMORY_LIMIT = 5;

interface EntitlementLike {
  isKinPlus: boolean;
}

interface ThemeLike {
  isPremium: boolean;
}

export function canCreateMemory(entitlement: EntitlementLike, existingCount: number): boolean {
  return entitlement.isKinPlus || existingCount < FREE_MEMORY_LIMIT;
}

export function canReadMemory(_entitlement: EntitlementLike, _memory: MemoryItem): boolean {
  return true;
}

export function canSelectTheme(entitlement: EntitlementLike, theme: ThemeLike): boolean {
  return !theme.isPremium || entitlement.isKinPlus;
}
