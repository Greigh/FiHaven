import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { exportCSV, exportAll } from '../../client/js/export.js';
import { setBills, setCards, setPayments, setSettings } from '../../client/js/storage.svelte.js';

function mountToast() {
  document.body.innerHTML = '<div id="toast"></div>';
}

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

describe('integration — export CSV + toast feedback', () => {
  beforeEach(() => {
    mountToast();
    setSettings({});
    setBills([{ id: 'B1', name: 'Rent', category: 'Housing', amount: 1500, dueDay: 1, frequency: 'Monthly' }]);
    setCards([{ id: 'C1', name: 'Visa', balance: 500, minPayment: 25 }]);
    setPayments([
      { id: 'p1', type: 'bill', refId: 'B1', name: 'Rent', amount: 1500, date: '2026-06-01', monthKey: '2026-06' },
    ]);
  });

  afterEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  it('shows a toast after each export type', () => {
    const toast = document.getElementById('toast');

    captureDownload(() => exportCSV('bills'));
    expect(toast.textContent).toBe('Bills exported to CSV.');
    expect(toast.classList.contains('show')).toBe(true);

    captureDownload(() => exportCSV('cards'));
    expect(toast.textContent).toBe('Cards exported to CSV.');

    captureDownload(() => exportCSV('history'));
    expect(toast.textContent).toBe('Payment history exported to CSV.');

    captureDownload(() => exportCSV('budget'));
    expect(toast.textContent).toMatch(/^Budget exported to CSV\.$/);
  });

  it('exportAll shows the batch toast and triggers three downloads', () => {
    vi.useFakeTimers();
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
    const toast = document.getElementById('toast');
    expect(toast.textContent).toBe('Exporting all data (3 files)…');
    expect(downloads).toBe(1);

    vi.advanceTimersByTime(800);
    expect(downloads).toBe(3);
    vi.useRealTimers();
  });
});
