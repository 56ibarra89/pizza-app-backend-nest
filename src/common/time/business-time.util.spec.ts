import {
  getBusinessDateParts,
  getBusinessDayBounds,
  getBusinessMonthEnd,
} from './business-time.util';

describe('business-time.util', () => {
  it('calcula la fecha comercial en America/Managua aunque el reloj UTC ya haya cambiado de día', () => {
    // 2026-11-05 02:30:00 UTC equivale a 2026-11-04 20:30:00 en America/Managua (UTC-6)
    const utcNight = new Date('2026-11-05T02:30:00.000Z');
    const parts = getBusinessDateParts(utcNight, 'America/Managua');

    expect(parts.ymd).toBe('2026-11-04');
    expect(parts.year).toBe(2026);
    expect(parts.month).toBe(11);
    expect(parts.day).toBe(4);
    expect(parts.hour).toBe(20);
    expect(parts.minute).toBe(30);
    expect(parts.weekday).toBe('WEDNESDAY');

    const bounds = getBusinessDayBounds(utcNight, 'America/Managua');
    expect(bounds.ymd).toBe('2026-11-04');
    expect(bounds.startOfDay.toISOString()).toBe('2026-11-04T06:00:00.000Z');
    expect(bounds.endOfDay.toISOString()).toBe('2026-11-05T05:59:59.999Z');
  });

  it('calcula el rango del día comercial a partir de una cadena YYYY-MM-DD', () => {
    const bounds = getBusinessDayBounds('2026-03-15', 'America/Managua');
    expect(bounds.ymd).toBe('2026-03-15');
    expect(bounds.startOfDay.toISOString()).toBe('2026-03-15T06:00:00.000Z');
    expect(bounds.endOfDay.toISOString()).toBe('2026-03-16T05:59:59.999Z');
  });

  it('calcula el fin de mes comercial usando la zona horaria del negocio', () => {
    // 2026-03-01 03:00:00 UTC sigue siendo 2026-02-28 21:00:00 en America/Managua
    const lateFebruaryLocal = new Date('2026-03-01T03:00:00.000Z');
    const monthEnd = getBusinessMonthEnd(lateFebruaryLocal, 'America/Managua');
    expect(monthEnd.toISOString()).toBe('2026-03-01T05:59:59.999Z');
  });
});
