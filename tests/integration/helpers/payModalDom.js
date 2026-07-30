/**
 * Minimal pay-modal DOM fixture for integration tests that exercise
 * modals.js pay flows without loading dashboard.html. Mirrors the pay
 * modal's markup there (ids only — no styling).
 */
export function mountPayModalDom() {
  document.body.innerHTML = `
    <div id="pay-modal" class="">
      <h2 id="pay-modal-title">Pay</h2>
      <div id="pay-presets-field"><div id="pay-chips"></div></div>
      <input type="number" id="pay-amount" step="0.01" min="0" />
      <div id="pay-goal-hint"></div>
      <input type="date" id="pay-date" />
      <input type="text" id="pay-note" />
      <button id="pay-ok-btn">Save Payment</button>
    </div>
    <div id="toast"></div>
    <div id="sync-status"></div>
  `;
}

/** The chips currently rendered, as { key, label, sub, amount } rows. */
export function renderedChips() {
  return Array.from(document.querySelectorAll('#pay-chips .pay-chip')).map((el) => ({
    key: el.dataset.key,
    label: el.querySelector('.pay-chip-main > span')?.textContent || '',
    sub: el.querySelector('.pay-chip-sub')?.textContent || '',
    amount: el.querySelector('.pay-chip-amt')?.textContent || '',
  }));
}
