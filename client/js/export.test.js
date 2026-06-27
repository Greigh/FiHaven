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
    expect(lines[0]).toBe('Date,Month,Type,Name,Amount,Note');
    expect(lines[1]).toContain('2026-06-01'); // newest first
  });

  it('builds a budget CSV for the active month', () => {
    const csv = captureDownload(() => exportCSV('budget'));
    expect(csv.split('\n')[0]).toBe('Name,Type,Category,Goal,Status,Amount Paid,Month');
    expect(csv).toContain('Rent');
    expect(csv).toContain('Visa');
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
