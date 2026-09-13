import { createMemoryItem } from '../commands';

describe('createMemoryItem', () => {
  const validInput = {
    id: 'memory-1',
    spaceId: 'space-1',
    createdBy: 'maya',
    kind: 'moment' as const,
    title: '  Our first date  ',
    occurredOn: '2025-12-05' as const,
    sourceMessageIds: ['message-1'],
    now: '2026-09-13T08:00:00.000Z',
  };

  it('creates remembered content as private by default and retains its source', () => {
    const memory = createMemoryItem(validInput);

    expect(memory).toMatchObject({
      id: 'memory-1',
      visibility: 'private',
      title: 'Our first date',
      occurredOn: '2025-12-05',
      note: '',
      sourceMessageIds: ['message-1'],
      mediaUris: [],
      createdAt: '2026-09-13T08:00:00.000Z',
      updatedAt: '2026-09-13T08:00:00.000Z',
    });
  });

  it('preserves an explicit shared choice', () => {
    expect(createMemoryItem({ ...validInput, visibility: 'shared' }).visibility).toBe('shared');
  });

  it('rejects a remembered item without a human title', () => {
    expect(() => createMemoryItem({ ...validInput, title: '   ' })).toThrow(
      'Give this memory a title',
    );
  });

  it.each(['05/12/2025', '2025-13-05', '2025-02-30', ''])('rejects invalid date %p', (date) => {
    expect(() => createMemoryItem({ ...validInput, occurredOn: date })).toThrow(
      'Choose a valid date',
    );
  });
});
