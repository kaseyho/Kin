import type { ISODate, MemoryItem } from './models';

export interface UpcomingMemory {
  item: MemoryItem;
  occursOn: ISODate;
  daysAway: number;
}

export function selectTimeline(memories: readonly MemoryItem[]): MemoryItem[] {
  return [...memories].sort((left, right) => {
    const dateOrder = left.occurredOn.localeCompare(right.occurredOn);
    return dateOrder === 0 ? left.createdAt.localeCompare(right.createdAt) : dateOrder;
  });
}

export function selectOnThisDay(memories: readonly MemoryItem[], today: ISODate): MemoryItem[] {
  const currentYear = yearOf(today);
  const monthAndDay = today.slice(5);

  return memories
    .filter(
      (item) =>
        item.kind === 'moment' &&
        item.occurredOn.slice(5) === monthAndDay &&
        yearOf(item.occurredOn) < currentYear,
    )
    .sort((left, right) => right.occurredOn.localeCompare(left.occurredOn));
}

export function selectUpcoming(
  memories: readonly MemoryItem[],
  today: ISODate,
  horizonDays: number,
): UpcomingMemory[] {
  const upcoming = memories.flatMap((item): UpcomingMemory[] => {
    const occursOn = nextOccurrence(item, today);
    if (!occursOn) return [];

    const daysAway = differenceInCalendarDays(today, occursOn);
    if (daysAway < 0 || daysAway > horizonDays) return [];

    return [{ item, occursOn, daysAway }];
  });

  return upcoming.sort(
    (left, right) =>
      left.daysAway - right.daysAway || left.item.title.localeCompare(right.item.title),
  );
}

function nextOccurrence(item: MemoryItem, today: ISODate): ISODate | null {
  if (item.kind === 'plan') {
    return item.occurredOn >= today ? item.occurredOn : null;
  }

  if (item.kind !== 'important_date') return null;

  const currentYear = yearOf(today);
  for (let year = currentYear; year <= currentYear + 8; year += 1) {
    const candidate = `${year}-${item.occurredOn.slice(5)}`;
    if (isValidDate(candidate) && candidate >= today) return candidate as ISODate;
  }

  return null;
}

function differenceInCalendarDays(start: ISODate, end: ISODate): number {
  const millisecondsPerDay = 86_400_000;
  return Math.round((toUtcMilliseconds(end) - toUtcMilliseconds(start)) / millisecondsPerDay);
}

function toUtcMilliseconds(date: ISODate): number {
  const [year, month, day] = date.split('-').map(Number);
  return Date.UTC(year, month - 1, day);
}

function yearOf(date: ISODate): number {
  return Number(date.slice(0, 4));
}

function isValidDate(value: string): boolean {
  const parts = value.split('-').map(Number);
  if (parts.length !== 3) return false;
  const [year, month, day] = parts;
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  );
}
