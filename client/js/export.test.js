import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { exportCSV, exportAll } from './export.js';
import { setBills, setCards, setPayments, setSettings } from './storage.svelte.js';

// exportCSV streams its result through a hidden <a download> rather than
// returning it; intercept the anchor's data: URL to read the CSV back.
function captureDownload(run) {
  let csv = '';
  const realCreate = document.createElement.bind(document);
  const spy = vi.spyOn(document, 'createElement').mockImplementation((tag) => {
    const el = realCreate(tag);
    if (String(tag).toLowerCase() === 'a') {
      Object.defineProperty(el, 'click', {
        configurable: true,
        value: () => {
          csv = decodeURIComponent(
            String(el.href).replace(/^data:text\/csv;charset=utf-8,/, ''),
          );
        },
      });
    }
    return el;
  });
  try {
    run();
  } finally {
    spy.mockRestore();
  }
  return csv;
}

describe('export — exportCSV', () => {
  beforeEach(() => {
    setSettings({});
    setBills([
      { id: 'B1', name: 'Rent', category: 'Housing', amount: 1500, dueDay: 1, frequency: 'Monthly', autopay: true, notes: 'note, with comma' },
    ]);
    setCards([
      { id: 'C1', name: 'Visa', balance: 500, limit: 2000, minPayment: 25, regularAPR: 22 },
    ]);
    setPayments([
      { id: 'p1', type: 'bill', refId: 'B1', name: 'Rent', amount: 1500, date: '2026-06-01', monthKey: '2026-06' },
    ]);
  });

  it('builds a bills CSV with a header and CSV-escapes a comma field', () => {
    const csv = captureDownload(() => exportCSV('bills'));
    const lines = csv.split('\n');
    expect(lines[0]).toBe('Name,Category,Amount,Due Day,Frequency,First Due,Stops On,Autopay,Autopay Day,Notes');
    expect(lines[1]).toContain('Rent');
    expect(csv).toContain('"note, with comma"');
  });

  it('builds a cards CSV', () => {
    const csv = captureDownload(() => exportCSV('cards'));
    expect(csv.split('\n')[0]).toContain('Name,Balance,Credit Limit');
    expect(csv).toContain('Visa');
  });

  it('builds a history CSV sorted by date', () => {
    setPayments([
      { id: 'a', type: 'bill', refId: 'B1', name: 'Rent', amount: 1500, date: '2026-05-01', monthKey: '2026-05' },
      { id: 'b', type: 'bill', refId: 'B1', name: 'Rent', amount: 1500, date: '2026-06-01', monthKey: '2026-06' },
    ]);
    const csv = captureDownload(() => exportCSV('history'));
    const lines = csv.split('\n');
    expect(lines[0]).toBe('Date,Month,Type,Name,Status,Amount,Note');
    expect(lines[1]).toContain('2026-06-01'); // newest first
    expect(lines[1]).toContain('Paid');
  });

  it('marks skipped periods as Skipped in the history CSV', () => {
    setPayments([
      { id: 'a', type: 'bill', refId: 'B1', name: 'Rent', amount: 1500, date: '2026-06-01', monthKey: '2026-06' },
      { id: 's', type: 'bill', refId: 'B1', name: 'Rent', amount: 0, date: '2026-07-01', monthKey: '2026-07',
        note: 'Skipped this period', skipped: true },
    ]);
    const csv = captureDownload(() => exportCSV('history'));
    const lines = csv.split('\n');
    expect(lines[1]).toContain('Skipped'); // 2026-07 sorts first
    expect(lines[2]).toContain('Paid');
  });

  it('builds a budget CSV for the active month', () => {
    const csv = captureDownload(() => exportCSV('budget'));
    expect(csv.split('\n')[0]).toBe('Name,Type,Category,Goal,Status,Amount Paid,Month');
    expect(csv).toContain('Rent');
    expect(csv).toContain('Visa');
  });
});

/* A cell beginning = + - or @ is executed as a formula by Excel / Sheets /
   LibreOffice, so a bill named `=HYPERLINK("http://evil","click")` runs the
   moment the export is opened. The leading tab forces the cell to text. */
describe('export — CSV formula injection', () => {
  beforeEach(() => {
    setSettings({});
    setCards([]);
    setPayments([]);
  });

  it('prefixes a tab to any cell that would be read as a formula', () => {
    setBills([
      { id: 'F1', name: '=HYPERLINK("http://evil","click")', category: 'Other', amount: 1, dueDay: 3 },
      { id: 'F2', name: '+1-800-EVIL', category: 'Other', amount: 1, dueDay: 4 },
      { id: 'F3', name: '@SUM(A1:A9)', category: 'Other', amount: 1, dueDay: 5 },
      { id: 'F4', name: '-2+3', category: 'Other', amount: 1, dueDay: 6 },
    ]);
    const csv = captureDownload(() => exportCSV('bills'));

    // The tab makes the cell quoted too (it is in the must-quote class).
    expect(csv).toContain('"\t=HYPERLINK(""http://evil"",""click"")"');
    expect(csv).toContain('"\t+1-800-EVIL"');
    expect(csv).toContain('"\t@SUM(A1:A9)"');
    expect(csv).toContain('"\t-2+3"');
    // No cell starts a formula.
    for (const line of csv.split('\n').slice(1)) {
      expect(line.startsWith('=')).toBe(false);
    }
  });

  it('leaves a bill with no due day blank rather than writing undefined', () => {
    setBills([{ id: 'B0', name: 'Ad hoc', category: 'Other', amount: 25, frequency: 'Monthly' }]);
    const csv = captureDownload(() => exportCSV('bills'));
    expect(csv.split('\n')[1]).toBe('Ad hoc,Other,25,,Monthly,,,No,,');
  });
});

describe('export — cards CSV amounts and flags', () => {
  beforeEach(() => {
    setSettings({});
    setBills([]);
    setPayments([]);
  });

  it('reports a promo card’s monthly need and its Yes flags', () => {
    const end = new Date();
    end.setMonth(end.getMonth() + 4);
    const promoEndDate = end.toISOString().slice(0, 10);

    // No minPayment at all: the promo spread is the whole monthly need.
    setCards([{
      id: 'C9', name: 'Promo', balance: 1200, limit: 5000,
      hasPromo: true, promoAPR: 0, promoEndDate, promoBalance: 1200,
      autopay: true, autopayDay: 9, dueDay: 14,
    }]);

    const row = captureDownload(() => exportCSV('cards')).split('\n')[1].split(',');
    expect(row[0]).toBe('Promo');
    expect(row[5]).toBe('Yes');          // Has Promo
    expect(row[11]).toBe('Yes');         // Autopay
    expect(row[12]).toBe('9');           // Autopay Day
    expect(parseFloat(row[9])).toBeGreaterThan(0); // Monthly Needed = promo spread
  });

  it('writes 0.00 for a non-promo card with no minimum payment set', () => {
    setCards([{ id: 'C8', name: 'Blank', balance: 300, limit: 1000 }]);
    const row = captureDownload(() => exportCSV('cards')).split('\n')[1].split(',');
    expect(row[9]).toBe('0.00');
    expect(row[5]).toBe('No');
    expect(row[11]).toBe('No');
  });
});

describe('export — unknown type', () => {
  it('downloads nothing for a type it does not know', () => {
    setSettings({});
    setBills([{ id: 'B1', name: 'Rent', amount: 1500, dueDay: 1 }]);
    setCards([]);
    setPayments([]);
    expect(captureDownload(() => exportCSV('not-a-type'))).toBe('');
  });
});

describe('export — exportAll', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    setSettings({});
    setBills([{ id: 'B1', name: 'Rent', amount: 1500, dueDay: 1 }]);
    setCards([{ id: 'C1', name: 'Visa', balance: 500, minPayment: 25 }]);
    setPayments([]);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('queues three CSV exports on a staggered timer', () => {
    let downloads = 0;
    const realCreate = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag) => {
      const el = realCreate(tag);
      if (String(tag).toLowerCase() === 'a') {
        Object.defineProperty(el, 'click', {
          configurable: true,
          value: () => { downloads += 1; },
        });
      }
      return el;
    });

    exportAll();
    expect(downloads).toBe(1);

    vi.advanceTimersByTime(400);
    expect(downloads).toBe(2);

    vi.advanceTimersByTime(400);
    expect(downloads).toBe(3);
  });
});
