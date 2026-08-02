import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { setBills, setPayments, setSettings, bills, settings } from './storage.svelte.js';

// The bill editor pulls in the whole modal/dashboard graph; the review only
// needs to know that clicking Edit hands off to it.
const editBillById = vi.hoisted(() => vi.fn());
vi.mock('./modals.js', () => ({ editBillById }));

const MODAL = `
  <div id="new-month-banner"></div>
  <div class="modal-overlay" id="rollover-modal">
    <span id="rollover-count"></span>
    <span id="rollover-hint"></span>
    <div id="rollover-wrap"><div id="rollover-body"></div></div>
  </div>
  <div class="modal-overlay" id="bill-modal"></div>
  <div id="toast"></div>`;

describe('rollover — review modal', () => {
  beforeEach(() => {
    document.body.innerHTML = MODAL;
    editBillById.mockClear();
    setSettings({ rolloverPrefill: 'average', rolloverPendingFor: '2026-08' });
    setPayments([]);
    setBills([
      { id: 'B1', name: 'Rent', amount: 1500, dueDay: 5, frequency: 'Monthly' },
      { id: 'B2', name: 'Gas', amount: 40, dueDay: 20, frequency: 'Monthly', autopay: true },
      { id: 'B3', name: 'Archived', amount: 10, dueDay: 1, endDate: '2000-01-01' },
    ]);
  });

  afterEach(() => { document.body.innerHTML = ''; });

  it('renders one row per active bill with a due date and an edit button', async () => {
    const { openRolloverReview } = await import('./rollover.js');
    openRolloverReview();

    const rows = document.querySelectorAll('#rollover-body .rollover-row');
    expect(rows.length).toBe(2); // the ended bill drops out
    expect(document.getElementById('rollover-count').textContent).toBe('2 bills');
    expect(document.getElementById('rollover-modal').classList.contains('open')).toBe(true);

    expect(rows[0].querySelector('.rollover-due').textContent).toMatch(/^Due \w{3} 5$/);
    // An autopay bill says so rather than "Due".
    expect(rows[1].querySelector('.rollover-due').textContent).toMatch(/^Autopays \w{3} 20$/);
    expect(rows[0].querySelector('.rollover-amt').value).toBe('1500.00');
    expect(rows.length).toBe(document.querySelectorAll('.rollover-edit').length);
  });

  it('hands a row\'s Edit button off to the bill editor', async () => {
    const { openRolloverReview } = await import('./rollover.js');
    openRolloverReview();

    document.querySelector('.rollover-edit').click();

    expect(editBillById).toHaveBeenCalledWith('B1');
    // The review steps aside while the editor is up.
    expect(document.getElementById('rollover-modal').classList.contains('open')).toBe(false);
  });

  it('leaves the account-level rollover open until it is actually handled', async () => {
    const { openRolloverReview, closeRolloverReview, clearRolloverPending } = await import('./rollover.js');
    openRolloverReview();
    // Merely looking at it (or cancelling) must not consume the prompt for the
    // other devices on the account.
    closeRolloverReview();
    expect(settings.rolloverPendingFor).toBe('2026-08');

    clearRolloverPending();
    expect(settings.rolloverPendingFor).toBe('');
  });

  it('saves typed amounts, leaves blank fields alone, and retires the banner', async () => {
    const { openRolloverReview, saveRolloverReview } = await import('./rollover.js');
    openRolloverReview();

    const inputs = document.querySelectorAll('#rollover-body .rollover-amt');
    inputs[0].value = '1600';
    inputs[1].value = '';
    saveRolloverReview();

    expect(bills.find((b) => b.id === 'B1').amount).toBe(1600);
    expect(bills.find((b) => b.id === 'B2').amount).toBe(40);
    expect(document.getElementById('rollover-modal').classList.contains('open')).toBe(false);
    expect(document.getElementById('new-month-banner').style.display).toBe('none');
    expect(settings.rolloverPendingFor).toBe('');
  });

  it('escapes bill names rather than injecting them as markup', async () => {
    setBills([{ id: 'B9', name: '<img src=x onerror=alert(1)>', amount: 5, dueDay: 3 }]);
    const { openRolloverReview } = await import('./rollover.js');
    openRolloverReview();

    expect(document.querySelectorAll('#rollover-body img').length).toBe(0);
    expect(document.querySelector('.rollover-name').textContent).toBe('<img src=x onerror=alert(1)>');
  });
});
