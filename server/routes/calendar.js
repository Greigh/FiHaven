/* ═══════════════════════════════════════════════════════════
   routes/calendar.js — public iCal feed for upcoming bill /
   card due dates. Authentication is via an unguessable token
   embedded in the URL (per-user; rotate or delete from
   Settings). Returns a valid VCALENDAR so iCal, Google
   Calendar, Outlook, etc. can subscribe.
═══════════════════════════════════════════════════════════ */

'use strict';

const express = require('express');
const dbApi = require('../db');

const router = express.Router();

// How many months of upcoming events to publish. iCal subscribers
// re-fetch the feed periodically; 6 months is enough lead time
// without making the file huge.
const LOOKAHEAD_MONTHS = 6;

function pad2(n) {
  return String(n).padStart(2, '0');
}

// VDATE in YYYYMMDD form for an all-day event (the dueDay is a
// day-of-month with no specific time).
function vdate(d) {
  return d.getUTCFullYear() + pad2(d.getUTCMonth() + 1) + pad2(d.getUTCDate());
}

// VTIMESTAMP in YYYYMMDDTHHMMSSZ for DTSTAMP.
function vstamp(d) {
  return (
    d.getUTCFullYear() +
    pad2(d.getUTCMonth() + 1) +
    pad2(d.getUTCDate()) +
    'T' +
    pad2(d.getUTCHours()) +
    pad2(d.getUTCMinutes()) +
    pad2(d.getUTCSeconds()) +
    'Z'
  );
}

// RFC-5545 §3.3.11 escaping: backslash, semicolon, comma, newline.
function vesc(s) {
  return String(s == null ? '' : s)
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');
}

// Long lines (>75 octets) must be folded per RFC-5545; do a simple
// 72-char split with CRLF + space to be safe on multi-byte content.
function fold(line) {
  if (line.length <= 72) return line;
  const out = [];
  let i = 0;
  while (i < line.length) {
    out.push(i === 0 ? line.slice(0, 72) : ' ' + line.slice(i, i + 71));
    i += i === 0 ? 72 : 71;
  }
  return out.join('\r\n');
}

function buildIcs(user, data) {
  const now = new Date();
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//FiHaven//Bill & Card Calendar//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${vesc('FiHaven bills & cards' + (user.name ? ' · ' + user.name : ''))}`,
    'X-WR-TIMEZONE:UTC',
  ];

  function emit(kind, item) {
    if (!item.dueDay) return;
    const day = Math.min(parseInt(item.dueDay, 10), 28);
    for (let m = 0; m < LOOKAHEAD_MONTHS; m++) {
      const d = new Date(Date.UTC(now.getFullYear(), now.getMonth() + m, day));
      if (d < new Date(now.getTime() - 86400000)) continue;
      const dEnd = new Date(d.getTime() + 86400000);
      const amount = kind === 'card'
        ? parseFloat(item.minPayment || 0)
        : parseFloat(item.amount || 0);
      const title = kind === 'card'
        ? `${item.name} payment · $${amount.toFixed(2)}`
        : `${item.name} · $${amount.toFixed(2)}`;
      const uid = `${kind}-${item.id}-${vdate(d)}@fihaven`;

      lines.push(
        'BEGIN:VEVENT',
        fold(`UID:${uid}`),
        `DTSTAMP:${vstamp(now)}`,
        `DTSTART;VALUE=DATE:${vdate(d)}`,
        `DTEND;VALUE=DATE:${vdate(dEnd)}`,
        fold(`SUMMARY:${vesc(title)}`),
        'TRANSP:TRANSPARENT',
        'BEGIN:VALARM',
        'ACTION:DISPLAY',
        `DESCRIPTION:${vesc(title)}`,
        'TRIGGER:-P1D',
        'END:VALARM',
        'END:VEVENT'
      );
    }
  }

  (data.bills || []).forEach((b) => emit('bill', b));
  (data.cards || []).forEach((c) => emit('card', c));

  lines.push('END:VCALENDAR');
  return lines.join('\r\n') + '\r\n';
}

router.get('/:token.ics', (req, res) => {
  const user = dbApi.findUserByIcalToken(req.params.token);
  if (!user) {
    res.status(404).type('text/plain').send('Not found');
    return;
  }
  const data = dbApi.getUserData(user.id);
  const body = buildIcs(user, data);
  res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
  res.setHeader(
    'Content-Disposition',
    'inline; filename="fihaven.ics"'
  );
  // Subscribers may poll often; allow them to cache for 1h.
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.send(body);
});

module.exports = router;
