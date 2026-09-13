import type { MemoryItem } from '../models';
import { selectOnThisDay, selectTimeline, selectUpcoming } from '../selectors';

const memories: MemoryItem[] = [
  {
    id: 'future-plan',
    spaceId: 'space-1',
    createdBy: 'maya',
    kind: 'plan',
    visibility: 'private',
    title: 'Visit the museum',
    occurredOn: '2026-12-10',
    note: '',
    sourceMessageIds: [],
    mediaUris: [],
    createdAt: '2026-09-13T08:00:00.000Z',
    updatedAt: '2026-09-13T08:00:00.000Z',
  },
  {
    id: 'first-date',
    spaceId: 'space-1',
    createdBy: 'maya',
    kind: 'moment',
    visibility: 'shared',
    title: 'Our first date',
    occurredOn: '2025-12-05',
    note: 'Warm noodles and no awkward silences.',
    sourceMessageIds: ['message-1'],
    mediaUris: [],
    createdAt: '2025-12-05T13:00:00.000Z',
    updatedAt: '2025-12-05T13:00:00.000Z',
  },
  {
    id: 'same-year',
    spaceId: 'space-1',
    createdBy: 'maya',
    kind: 'moment',
    visibility: 'private',
    title: 'Today, this year',
    occurredOn: '2026-12-05',
    note: '',
    sourceMessageIds: [],
    mediaUris: [],
    createdAt: '2026-12-05T08:00:00.000Z',
    updatedAt: '2026-12-05T08:00:00.000Z',
  },
  {
    id: 'birthday',
    spaceId: 'space-1',
    createdBy: 'maya',
    kind: 'important_date',
    visibility: 'private',
    title: "Jamie's birthday",
    occurredOn: '1999-12-06',
    note: '',
    sourceMessageIds: [],
    mediaUris: [],
    createdAt: '2026-09-13T08:00:00.000Z',
    updatedAt: '2026-09-13T08:00:00.000Z',
  },
];

describe('relationship selectors', () => {
  it('orders a timeline without mutating the input list', () => {
    const originalOrder = memories.map((item) => item.id);

    expect(selectTimeline(memories).map((item) => item.id)).toEqual([
      'birthday',
      'first-date',
      'same-year',
      'future-plan',
    ]);
    expect(memories.map((item) => item.id)).toEqual(originalOrder);
  });

  it('surfaces only matching calendar dates from an earlier year', () => {
    expect(selectOnThisDay(memories, '2026-12-05').map((item) => item.id)).toEqual([
      'first-date',
    ]);
  });

  it('surfaces upcoming plans and the next occurrence of important dates', () => {
    expect(selectUpcoming(memories, '2026-12-05', 7)).toEqual([
      { item: memories[3], occursOn: '2026-12-06', daysAway: 1 },
      { item: memories[0], occursOn: '2026-12-10', daysAway: 5 },
    ]);
  });
});
