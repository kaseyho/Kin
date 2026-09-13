import type { CreateMemoryInput, ISODate, MemoryItem } from './models';

export class DomainError extends Error {
  constructor(
    message: string,
    readonly field?: string,
  ) {
    super(message);
    this.name = 'DomainError';
  }
}

export function createMemoryItem(input: CreateMemoryInput): MemoryItem {
  const title = input.title.trim();
  if (!title) {
    throw new DomainError('Give this memory a title', 'title');
  }

  if (!isISODate(input.occurredOn)) {
    throw new DomainError('Choose a valid date', 'occurredOn');
  }

  return {
    id: input.id,
    spaceId: input.spaceId,
    createdBy: input.createdBy,
    kind: input.kind,
    visibility: input.visibility ?? 'private',
    title,
    occurredOn: input.occurredOn,
    note: input.note?.trim() ?? '',
    place: input.place?.trim() || undefined,
    sourceMessageIds: [...input.sourceMessageIds],
    mediaUris: [...(input.mediaUris ?? [])],
    createdAt: input.now,
    updatedAt: input.now,
  };
}

function isISODate(value: string): value is ISODate {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}
