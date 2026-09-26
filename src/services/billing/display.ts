export function billingPeriodLabel(period: string | null | undefined): string | undefined {
  const parsed = parsePeriod(period);
  if (!parsed) return undefined;
  if (parsed.amount === 1) return `per ${parsed.unit}`;
  return `every ${parsed.amount} ${parsed.unit}s`;
}

export function trialPeriodLabel(period: string | null | undefined): string | undefined {
  const parsed = parsePeriod(period);
  if (!parsed) return undefined;
  return `${parsed.amount}-${parsed.unit} free trial`;
}

export function isHttpsUrl(value: string | null | undefined): value is string {
  if (!value) return false;
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

function parsePeriod(value: string | null | undefined): { amount: number; unit: string } | null {
  const match = value?.match(/^P([1-9]\d*)([DWMY])$/);
  if (!match) return null;
  const unit = ({ D: 'day', M: 'month', W: 'week', Y: 'year' } as const)[match[2] as 'D' | 'M' | 'W' | 'Y'];
  return { amount: Number(match[1]), unit };
}
