import type { MemoryItem } from '../models';
import { canCreateMemory, canReadMemory, canSelectTheme, FREE_MEMORY_LIMIT } from '../limits';

const existingMemory = {
  id: 'memory-1',
  spaceId: 'space-1',
} as MemoryItem;

describe('Kin+ capability rules', () => {
  it('allows five free memories and gates the sixth new one', () => {
    expect(FREE_MEMORY_LIMIT).toBe(5);
    expect(canCreateMemory({ isKinPlus: false }, 4)).toBe(true);
    expect(canCreateMemory({ isKinPlus: false }, 5)).toBe(false);
  });

  it('allows unlimited new memories with Kin+', () => {
    expect(canCreateMemory({ isKinPlus: true }, 500)).toBe(true);
  });

  it('keeps existing memories readable after Kin+ expires', () => {
    expect(canReadMemory({ isKinPlus: false }, existingMemory)).toBe(true);
  });

  it('previews but does not select a premium theme without Kin+', () => {
    expect(canSelectTheme({ isKinPlus: false }, { isPremium: false })).toBe(true);
    expect(canSelectTheme({ isKinPlus: false }, { isPremium: true })).toBe(false);
    expect(canSelectTheme({ isKinPlus: true }, { isPremium: true })).toBe(true);
  });
});
