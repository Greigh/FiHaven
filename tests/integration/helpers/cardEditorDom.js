/**
 * Minimal card-editor DOM fixture for integration tests that exercise
 * modals.js preset + save flows without loading dashboard.html.
 */
export function mountCardEditorDom() {
  document.body.innerHTML = `
    <div id="card-modal" class="">
      <select id="c-type"><option value="card">card</option><option value="loan">loan</option></select>
      <select id="c-reward-preset"><option value="">Choose a card…</option></select>
      <input id="c-name" />
      <input id="c-issuer" />
      <input id="c-balance" value="0" />
      <input id="c-current-balance" />
      <input id="c-limit" value="0" />
      <input id="c-minpay" value="25" />
      <input id="c-recommended" />
      <input id="c-apr" value="0" />
      <input id="c-annualfee" />
      <select id="c-feemonth"><option value="">—</option><option value="3">March</option></select>
      <div id="c-annualfee-field"></div>
      <div id="c-feemonth-field"></div>
      <input id="c-lastdigits" />
      <select id="c-network"><option value="">—</option><option value="Visa">Visa</option></select>
      <input id="c-haspromo" type="checkbox" />
      <input id="c-promoapr" />
      <input id="c-promoend" />
      <input id="c-promobal" />
      <input id="c-dueday" value="1" />
      <input id="c-autopay" type="checkbox" />
      <input id="c-autopayday" />
      <div id="c-autopayday-field" hidden></div>
      <input id="c-notes" />
      <input id="c-reward-base" />
      <input id="c-reward-pointvalue" />
      <div id="c-reward-cats"></div>
      <div id="c-reward-rotating" hidden></div>
      <div id="c-perks-list"></div>
      <div id="c-perks-field"></div>
      <div id="c-offers-list"></div>
      <div id="c-offers-field"></div>
      <div id="c-limit-field"></div>
      <div id="c-current-balance-field"></div>
      <div id="c-recommended-field"></div>
      <div id="c-haspromo-field"></div>
      <div id="c-rewards-field"></div>
      <div id="promo-fields"></div>
      <span id="lbl-c-balance"></span>
      <span id="lbl-c-minpay"></span>
      <span id="lbl-c-autopay"></span>
      <span id="card-modal-title"></span>
    </div>
    <div id="toast"></div>
    <div id="sync-status"></div>
  `;
}
