/* ═══════════════════════════════════════════════════════════
   nextUrl.js — validates the `?next=` hand-off used to carry a
   deep link across sign-in (e.g. the "Manage notification
   preferences" link in an email lands on /settings even though the
   recipient wasn't signed in).

   Anything that ends up in `window.location` has to be treated as
   hostile: `next` rides in on a URL, so a bare pass-through would be
   an open redirect anyone could point at their own domain. Rather
   than filter the input, the target is rebuilt from an allowlist —
   the path is a literal from ALLOWED_PATHS and the query/hash are
   re-encoded — so nothing an attacker writes reaches the navigation
   verbatim.
═══════════════════════════════════════════════════════════ */

// Longer than any real in-app link; a giant `next` is someone probing.
var MAX_LEN = 512;

// Every page sign-in is allowed to return to. `next` is only ever set
// by the server-side gate (server/pageGate.js) or by initPrivatePage()
// in auth.js, and both run on a private page — so this is the complete
// set of legitimate destinations. Anything else falls back to the
// dashboard at the call site.
var ALLOWED_PATHS = ['/dashboard', '/settings', '/plaid-oauth', '/dev-portal'];

// Query and fragment carry app state (`?tab=notifications`,
// `#notifications`, Plaid's `?oauth_state_id=…`) — narrow, opaque
// tokens, never prose or markup.
var SAFE_KEY   = /^[A-Za-z0-9_-]{1,32}$/;
var SAFE_VALUE = /^[A-Za-z0-9._~-]{0,128}$/;
var SAFE_HASH  = /^[A-Za-z0-9_-]{1,64}$/;
var MAX_PARAMS = 8;

/**
 * Reduce a candidate `next` to a known-safe same-origin path, or ''.
 * The return value is assembled from ALLOWED_PATHS plus re-encoded
 * parameters, so it never contains caller-supplied text unchanged.
 */
export function safeNextPath(raw) {
  if (!raw) return '';
  var s = String(raw);
  if (s.length > MAX_LEN) return '';
  // Control characters (and the newline/tab that browsers strip before
  // parsing) can smuggle a scheme past a naive prefix check.
  if (/[\x00-\x1f\x7f]/.test(s)) return '';

  // Split off the fragment first — a '?' after '#' is part of the hash.
  var hash = '';
  var hashAt = s.indexOf('#');
  if (hashAt !== -1) {
    hash = s.slice(hashAt + 1);
    s = s.slice(0, hashAt);
  }
  var query = '';
  var queryAt = s.indexOf('?');
  if (queryAt !== -1) {
    query = s.slice(queryAt + 1);
    s = s.slice(0, queryAt);
  }

  // The path has to *be* one of the allowlisted pages. Matching yields
  // the literal from the list, not the caller's copy of it.
  var path = '';
  for (var i = 0; i < ALLOWED_PATHS.length; i++) {
    if (ALLOWED_PATHS[i] === s) { path = ALLOWED_PATHS[i]; break; }
  }
  if (!path) return '';

  return path + safeQuery(query) + safeHash(hash);
}

// Re-encode the query from scratch, dropping any parameter that isn't a
// plain key/token pair. URLSearchParams handles the escaping.
function safeQuery(raw) {
  if (!raw) return '';
  var out;
  try {
    out = new URLSearchParams();
    var seen = 0;
    new URLSearchParams(raw).forEach(function (value, key) {
      if (seen >= MAX_PARAMS) return;
      if (!SAFE_KEY.test(key) || !SAFE_VALUE.test(value)) return;
      out.append(key, value);
      seen++;
    });
  } catch (_) {
    return '';
  }
  var qs = out.toString();
  return qs ? '?' + qs : '';
}

function safeHash(raw) {
  if (!raw || !SAFE_HASH.test(raw)) return '';
  return '#' + raw;
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
