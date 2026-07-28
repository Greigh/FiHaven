/* ═══════════════════════════════════════════════════════════
   nextUrl.js — validates the `?next=` hand-off used to carry a
   deep link across sign-in (e.g. the "Manage notification
   preferences" link in an email lands on /settings even though the
   recipient wasn't signed in).

   Anything that ends up in `window.location` has to be treated as
   hostile: `next` rides in on a URL, so a bare pass-through would be
   an open redirect anyone could point at their own domain. Only a
   same-origin absolute path is allowed through.
═══════════════════════════════════════════════════════════ */

// Longer than any real in-app link; a giant `next` is someone probing.
var MAX_LEN = 512;

export function safeNextPath(raw) {
  if (!raw) return '';
  var s = String(raw);
  if (s.length > MAX_LEN) return '';
  // Control characters (and the newline/tab that browsers strip before
  // parsing) can smuggle a scheme past a naive prefix check.
  if (/[\x00-\x1f\x7f]/.test(s)) return '';
  // Must be an absolute path on this origin. `//host` and `/\host` are
  // protocol-relative — browsers navigate off-site for both.
  if (s.charAt(0) !== '/') return '';
  if (s.charAt(1) === '/' || s.charAt(1) === '\\') return '';
  return s;
}

/** Read + validate `next` from a query string (defaults to the page's). */
export function nextFromSearch(search) {
  try {
    var q = search == null ? window.location.search : search;
    return safeNextPath(new URLSearchParams(q).get('next'));
  } catch (_) {
    return '';
  }
}

/** The sign-in URL that comes back to `path` afterwards. */
export function loginWithNext(path) {
  var safe = safeNextPath(path);
  return safe ? '/login?next=' + encodeURIComponent(safe) : '/login';
}
