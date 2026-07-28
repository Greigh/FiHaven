/* ═══════════════════════════════════════════════════════════
   unsubscribe.js — the page behind the "Unsubscribe" link in every
   notification email. The signed token in ?t= is the only credential,
   so this works signed out, on any device.

   It deliberately confirms before changing anything: corporate mail
   scanners follow links in incoming messages, and a bare GET that
   opted people out would silently kill their reminders.

   Talks to GET /unsubscribe/info and POST /unsubscribe.
═══════════════════════════════════════════════════════════ */

import './theme.js';
import './navbar.js';

var heading = document.querySelector('[data-unsub-heading]');
var status = document.querySelector('[data-unsub-status]');
var confirmBox = document.querySelector('[data-unsub-confirm]');
var doneBox = document.querySelector('[data-unsub-done]');
var badBox = document.querySelector('[data-unsub-bad]');
var whatEl = document.querySelector('[data-unsub-what]');
var goBtn = document.querySelector('[data-unsub-go]');

function show(el, text, isError) {
  if (!el) return;
  el.textContent = text || '';
  el.style.color = isError ? 'var(--red)' : 'var(--muted)';
}

function showBad(note) {
  if (heading) heading.textContent = 'This link didn’t work';
  show(status, note || 'The unsubscribe link is invalid or incomplete.', true);
  if (confirmBox) confirmBox.hidden = true;
  if (badBox) badBox.hidden = false;
}

var token = new URLSearchParams(window.location.search).get('t') || '';

function confirmUnsub() {
  if (goBtn) goBtn.disabled = true;
  show(status, 'Updating your preferences…', false);
  fetch('/unsubscribe?t=' + encodeURIComponent(token), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  })
    .then(function (r) {
      return r.json().catch(function () { return {}; })
        .then(function (d) { return { ok: r.ok, data: d }; });
    })
    .catch(function () { return { ok: false, data: { error: 'network' } }; })
    .then(function (res) {
      if (goBtn) goBtn.disabled = false;
      if (!res.ok) {
        if (res.data && res.data.error === 'network') {
          show(status, 'Could not reach the server. Check your connection and try again.', true);
          return;
        }
        showBad();
        return;
      }
      if (heading) heading.textContent = 'Unsubscribed ✓';
      show(status, 'You won’t get ' + (res.data.label || 'these emails') + ' any more.', false);
      if (confirmBox) confirmBox.hidden = true;
      if (doneBox) doneBox.hidden = false;
    });
}

function init() {
  if (!token) { showBad('This link is missing its unsubscribe code.'); return; }

  fetch('/unsubscribe/info?t=' + encodeURIComponent(token))
    .then(function (r) {
      return r.json().catch(function () { return {}; })
        .then(function (d) { return { ok: r.ok, data: d }; });
    })
    .catch(function () { return { ok: false, data: { error: 'network' } }; })
    .then(function (res) {
      if (!res.ok) {
        showBad(
          res.data && res.data.error === 'network'
            ? 'Could not reach the server. Check your connection and reload.'
            : 'This unsubscribe link is invalid or no longer valid.'
        );
        return;
      }
      show(status, 'Confirm to stop these emails.', false);
      if (whatEl) whatEl.textContent = res.data.label || 'these emails';
      if (confirmBox) confirmBox.hidden = false;
      if (goBtn) goBtn.onclick = confirmUnsub;
    });
}

init();
