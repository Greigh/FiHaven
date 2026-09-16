import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const calendarRouter = require('./routes/calendar');
const buildIcs = calendarRouter.buildIcs;

describe('calendar route — buildIcs', () => {
  it('formats amounts in USD by default', () => {
    const user = { name: 'Alice' };
    const data = {
      bills: [{ id: 1, name: 'Internet', amount: 80, dueDay: 15 }],
      cards: [],
      settings: {},
    };
    const ics = buildIcs(user, data);
    expect(ics).toContain('Internet · $80.00');
  });

  it('formats amounts with user settings currency (e.g. EUR)', () => {
    const user = { name: 'Bob' };
    const data = {
      bills: [{ id: 2, name: 'Phone', amount: 45.5, dueDay: 10 }],
      cards: [],
      settings: { currency: 'EUR' },
    };
    const ics = buildIcs(user, data);
    expect(ics).toContain('Phone · €45.50');
  });

  it('clamps day 31 bills to actual days of month without overflowing into next month', () => {
    const user = { name: 'Charlie' };
    const data = {
      bills: [{ id: 3, name: 'Rent', amount: 1500, dueDay: 31 }],
      cards: [],
      settings: { currency: 'USD' },
    };
    const ics = buildIcs(user, data);
    expect(ics).toContain('BEGIN:VCALENDAR');
    expect(ics).toContain('Rent · $1\\,500.00');
    // Clamped properly in Feb to 28th
    expect(ics).toContain('UID:bill-3-20270228@fihaven');
    // Clamped in 30-day month (September or November) to 30th
    expect(ics).toContain('UID:bill-3-20261130@fihaven');
  });
});
