/* ═══════════════════════════════════════════════════════════
   presetUpdates.js — when the admin catalog changes rates for a
   card the user imported from a preset, offer Update / Keep mine
   instead of silently overwriting their data.
═══════════════════════════════════════════════════════════ */

import { cards, save } from './storage.svelte.js';
import {
  findPendingPresetUpdates,
  applyPresetRates,
  formatRateDiff,
} from './cardPresets.js';
import { openConfirm, closeConfirmModal } from './modals.js';
import { renderCards } from './cards.js';
import { refreshAll } from './utils.js';

var queue = [];
var showing = false;

function persistCards() {
  save('fh_cards', cards);
  try { renderCards(); } catch (_) {}
  try { refreshAll(); } catch (_) {}
}

function showNext() {
  if (showing) return;
  if (!queue.length) return;
  showing = true;
  var item = queue.shift();
  var card = item.card;
  var preset = item.preset;
  var label = (card.issuer ? card.issuer + ' ' : '') + (card.name || 'Card');
  var catalog = (preset.issuer ? preset.issuer + ' ' : '') + (preset.name || 'catalog');
  var diff = formatRateDiff(card, preset) || 'Rates changed in the shared catalog.';
  var title = 'Update rates for "' + label + '"?';
  var msg = 'The FiHaven catalog for ' + catalog + ' has newer rates.\n\n' +
    diff +
    '\n\nUpdate applies catalog rates to this card. Keep mine leaves your numbers alone.';

  // Wire Cancel = decline (Keep mine).
  var cancelBtn = document.querySelector('#confirm-modal .btn-ghost');
  var prevCancel = cancelBtn && cancelBtn.onclick;
  var finished = false;
  function finish() {
    if (finished) return;
    finished = true;
    showing = false;
    if (cancelBtn) {
      if (prevCancel) cancelBtn.onclick = prevCancel;
      else cancelBtn.removeAttribute('onclick');
      cancelBtn.textContent = 'Cancel';
      cancelBtn.onclick = function () { closeConfirmModal(); };
    }
    setTimeout(showNext, 80);
  }

  if (cancelBtn) {
    cancelBtn.textContent = 'Keep mine';
    cancelBtn.onclick = function () {
      var idx = cards.findIndex(function (c) { return c && c.id === card.id; });
      if (idx >= 0) {
        cards[idx].declinedPresetUpdatedAt = preset.updatedAt != null ? preset.updatedAt : 0;
        if (!cards[idx].presetId) cards[idx].presetId = preset.id;
        persistCards();
      }
      closeConfirmModal();
      finish();
    };
  }

  openConfirm(title, msg, function () {
    var idx = cards.findIndex(function (c) { return c && c.id === card.id; });
    if (idx >= 0) {
      cards[idx] = applyPresetRates(cards[idx], preset);
      persistCards();
    }
    finish();
  }, 'Update rates', 'btn-primary');

  // openConfirm's OK path closes the modal but doesn't call our finish if
  // confirm-ok already closes — wrap by observing close.
  var okBtn = document.getElementById('confirm-ok-btn');
  if (okBtn) {
    var orig = okBtn.onclick;
    okBtn.onclick = function () {
      if (orig) orig();
      finish();
    };
  }
}

/**
 * After the live catalog is loaded, prompt for any cards that need a
 * catalog-rate decision. Safe to call multiple times.
 */
export function checkPresetUpdates() {
  var pending = findPendingPresetUpdates(cards);
  // Persist quiet acceptance stamps / attached presetIds from the scan.
  if (pending.length || cards.some(function (c) { return c && c.presetId; })) {
    save('fh_cards', cards);
  }
  if (!pending.length) return;
  queue = pending.slice();
  showNext();
}
