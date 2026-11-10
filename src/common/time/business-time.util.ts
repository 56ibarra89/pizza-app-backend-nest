import type { WeekDay } from '@prisma/client';

export const DEFAULT_BUSINESS_TIME_ZONE = 'America/Managua';

export interface BusinessDateParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  weekday: WeekDay;
  ymd: string;
}

export function getBusinessTimeZone(): string {
  const configured = process.env.BUSINESS_TIME_ZONE?.trim();
  return configured && configured.length > 0
    ? configured
    : DEFAULT_BUSINESS_TIME_ZONE;
}

export function getBusinessDateParts(
  date: Date = new Date(),
  timeZone: string = getBusinessTimeZone(),
): BusinessDateParts {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'long',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });

  const rawParts = Object.fromEntries(
    formatter.formatToParts(date).map((part) => [part.type, part.value]),
  );

  const year = Number.parseInt(rawParts.year ?? '1970', 10);
  const month = Number.parseInt(rawParts.month ?? '01', 10);
  const day = Number.parseInt(rawParts.day ?? '01', 10);
  const rawHour = Number.parseInt(rawParts.hour ?? '00', 10);
  const hour = rawHour === 24 ? 0 : rawHour;
  const minute = Number.parseInt(rawParts.minute ?? '00', 10);
  const second = Number.parseInt(rawParts.second ?? '00', 10);
  const weekday = (rawParts.weekday?.toUpperCase() || 'SUNDAY') as WeekDay;
  const ymd = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

  return {
    year,
    month,
    day,
    hour,
    minute,
    second,
    weekday,
    ymd,
  };
}

export function toBusinessZonedDate(
  components: {
    year: number;
    month: number;
    day: number;
    hour?: number;
    minute?: number;
    second?: number;
    ms?: number;
  },
  timeZone: string = getBusinessTimeZone(),
): Date {
  const hour = components.hour ?? 0;
  const minute = components.minute ?? 0;
  const second = components.second ?? 0;
  const ms = components.ms ?? 0;

  const targetUtc = Date.UTC(
    components.year,
    components.month - 1,
    components.day,
    hour,
    minute,
    second,
    ms,
  );

  const computeOffsetMs = (instantMs: number): number => {
    const parts = getBusinessDateParts(new Date(instantMs), timeZone);
    const zonedUtc = Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      parts.second,
      ms,
    );
    return zonedUtc - instantMs;
  };

  const firstOffset = computeOffsetMs(targetUtc);
  const firstCandidate = targetUtc - firstOffset;
  const secondOffset = computeOffsetMs(firstCandidate);

  return new Date(targetUtc - secondOffset);
}

export function getBusinessDayBounds(
  dateOrYmd: Date | string = new Date(),
  timeZone: string = getBusinessTimeZone(),
): {
  ymd: string;
  year: number;
  month: number;
  day: number;
  startOfDay: Date;
  endOfDay: Date;
} {
  let year: number;
  let month: number;
  let day: number;
  let ymd: string;

  if (typeof dateOrYmd === 'string') {
    const trimmed = dateOrYmd.trim();
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
    if (!match) {
      throw new Error(`Formato de fecha inválido: ${dateOrYmd}`);
    }
    year = Number.parseInt(match[1], 10);
    month = Number.parseInt(match[2], 10);
    day = Number.parseInt(match[3], 10);
    const probe = new Date(Date.UTC(year, month - 1, day));
    if (
      probe.getUTCFullYear() !== year ||
      probe.getUTCMonth() + 1 !== month ||
      probe.getUTCDate() !== day
    ) {
      throw new Error(`Fecha fuera de rango: ${dateOrYmd}`);
    }
    ymd = trimmed;
  } else {
    const parts = getBusinessDateParts(dateOrYmd, timeZone);
    year = parts.year;
    month = parts.month;
    day = parts.day;
    ymd = parts.ymd;
  }

  const startOfDay = toBusinessZonedDate(
    { year, month, day, hour: 0, minute: 0, second: 0, ms: 0 },
    timeZone,
  );
  const endOfDay = toBusinessZonedDate(
    { year, month, day, hour: 23, minute: 59, second: 59, ms: 999 },
    timeZone,
  );

  return {
    ymd,
    year,
    month,
    day,
    startOfDay,
    endOfDay,
  };
}

export function getBusinessMonthEnd(
  date: Date = new Date(),
  timeZone: string = getBusinessTimeZone(),
): Date {
  const { year, month } = getBusinessDateParts(date, timeZone);
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return toBusinessZonedDate(
    { year, month, day: lastDay, hour: 23, minute: 59, second: 59, ms: 999 },
    timeZone,
  );
}

export function parseBusinessDateInput(
  value: string,
  bound: 'start' | 'end' = 'start',
  timeZone: string = getBusinessTimeZone(),
): Date {
  const trimmed = value.trim();
  const dateOnlyMatch =
    /^(\d{4}-\d{2}-\d{2})(?:$|T00:00:00(?:\.000)?(?:Z|[+-]00:00)?$)/.exec(
      trimmed,
    );
  if (dateOnlyMatch) {
    const bounds = getBusinessDayBounds(dateOnlyMatch[1], timeZone);
    return bound === 'end' ? bounds.endOfDay : bounds.startOfDay;
  }
  return new Date(trimmed);
}

export function isBusinessDateExpired(
  expirationDate: Date,
  now: Date = new Date(),
  timeZone: string = getBusinessTimeZone(),
): boolean {
  if (
    expirationDate.getUTCHours() === 0 &&
    expirationDate.getUTCMinutes() === 0 &&
    expirationDate.getUTCSeconds() === 0 &&
    expirationDate.getUTCMilliseconds() === 0
  ) {
    const expirationYmd = `${String(expirationDate.getUTCFullYear()).padStart(4, '0')}-${String(expirationDate.getUTCMonth() + 1).padStart(2, '0')}-${String(expirationDate.getUTCDate()).padStart(2, '0')}`;
    return expirationYmd < getBusinessDateParts(now, timeZone).ymd;
  }
  return expirationDate < now;
}
