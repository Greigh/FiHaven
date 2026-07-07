/* ═══════════════════════════════════════════════════════════
   subscriptionIcons.js — map a subscription / merchant name to a
   recognizable icon.

   Resolution order, longest brand key first:
     1. a bundled real SVG logo   (BRAND_LOGO_PATHS, rendered as <img>)
     2. a per-brand emoji stand-in (BRAND_EMOJI)
     3. a category / generic emoji (only in subscriptionIconInfo)

   brandIconInfo() stops at step 2 and returns null when nothing matched,
   so callers that already have a good category icon (e.g. the dashboard
   "upcoming" rows) only override it for a recognized brand. One lookup
   serves the whole app (subscriptions panel, upcoming rows, spending).
═══════════════════════════════════════════════════════════ */

import { BRAND_LOGO_PATHS, logoDataUri } from './subscriptionLogos.js';

/** Normalize a name for matching: lowercase, strip non-alphanumerics. */
function norm(name) {
  return (name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** Recognizable per-brand emoji stand-ins (used when no real logo is bundled). */
const BRAND_EMOJI = {
  netflix: '🎬', disney: '🏰', disneyplus: '🏰', hulu: '📺', max: '📺', hbomax: '📺', hbo: '📺',
  peacock: '🦚', paramount: '⛰️', paramountplus: '⛰️', appletv: '🍏', appletvplus: '🍏', apple: '🍏',
  icloud: '☁️', icloudstorage: '☁️', icloudplus: '☁️', googleone: '☁️', dropbox: '📦', onedrive: '☁️',
  spotify: '🎵', applemusic: '🎵', youtubemusic: '🎵', pandora: '🎵', tidal: '🎵', music: '🎵', deezer: '🎵',
  youtube: '▶️', youtubepremium: '▶️', youtubetv: '📺', twitch: '🎮', xboxgamepass: '🎮',
  playstationplus: '🎮', playstation: '🎮', nintendo: '🎮', nintendoswitchonline: '🎮',
  amazon: '📦', amazonprime: '📦', primevideo: '📦',
  audible: '🎧', kindle: '📚', kindleunlimited: '📚',
  nyt: '📰', nytimes: '📰', wsj: '📰', washingtonpost: '📰', medium: '📰', theathletic: '📰',
  patreon: '🅿️', substack: '📩', notion: '📝', evernote: '📝', obsidian: '📝',
  adobe: '🎨', adobecc: '🎨', canva: '🎨', figma: '🎨', lightroom: '🎨',
  onepassword: '🔐', bitwarden: '🔐', lastpass: '🔐', dashlane: '🔐',
  nordvpn: '🛡️', expressvpn: '🛡️', protonvpn: '🛡️', proton: '🛡️',
  chatgpt: '🤖', openai: '🤖', claude: '🤖', anthropic: '🤖', midjourney: '🤖', perplexity: '🤖',
  github: '🐙', githubcopilot: '🐙', githubpro: '🐙',
  peloton: '🚲', strava: '🏃', calm: '🧘', headspace: '🧘', fitbit: '⌚', whoop: '⌚',
  crunchyroll: '🍥', openbubbles: '💬', slack: '💬', discord: '💬', zoom: '🎥',
  microsoft365: '📎', office365: '📎', microsoft: '📎', google: '🔎', googleworkspace: '📎',
  linkedin: '💼', grammarly: '✍️', duolingo: '🦉', masterclass: '🎓', coursera: '🎓', skillshare: '🎓',
};

// Normalized-name variants → the bundled logo key that best represents them.
// Handles names that strip to a different key than the logo filename, e.g.
// "Disney+" → "disney", "HBO Max"/"Max" → "max", "Amazon Prime" → "primevideo".
const LOGO_ALIASES = {
  disney: 'disneyplus', hbo: 'max', hbomax: 'max', hbogo: 'max',
  amazonprime: 'primevideo', amazonprimevideo: 'primevideo', prime: 'primevideo',
  appletvplus: 'appletv', icloudplus: 'icloud', icloudstorage: 'icloud',
  youtubepremium: 'youtube', youtubetv: 'youtube',
  playstationplus: 'playstation', psplus: 'playstation',
  nintendoswitchonline: 'nintendoswitch', nintendoswitchonlin: 'nintendoswitch',
  paramount: 'paramountplus', githubcopilot: 'github', githubpro: 'github',
  googleone: 'googledrive', chatgpt: 'openai', onepasswordfamilies: 'onepassword',
};

// Longest keys first so "applemusic" wins over "apple", "disneyplus" over "disney".
const BRANDS_BY_LEN = Object.keys(BRAND_EMOJI).sort((a, b) => b.length - a.length);
const LOGO_KEYS = Object.keys(BRAND_LOGO_PATHS).sort((a, b) => b.length - a.length);

/** The bundled-logo key for a normalized name, or null. */
function findLogoKey(key) {
  if (BRAND_LOGO_PATHS[key]) return key;
  if (LOGO_ALIASES[key] && BRAND_LOGO_PATHS[LOGO_ALIASES[key]]) return LOGO_ALIASES[key];
  for (const k of LOGO_KEYS) if (key.includes(k)) return k;
  return null;
}

/** The per-brand emoji for a normalized name, or null when no brand matched. */
function brandEmoji(key) {
  if (BRAND_EMOJI[key]) return BRAND_EMOJI[key];
  for (const b of BRANDS_BY_LEN) if (key.includes(b)) return BRAND_EMOJI[b];
  return null;
}

/**
 * Brand-only icon for a name: a real logo, then an emoji stand-in, else null.
 * Returns null (no category/generic fallback) so callers can keep their own
 * default when the name isn't a recognized brand.
 */
export function brandIconInfo(name) {
  const key = norm(name);
  const logoKey = findLogoKey(key);
  if (logoKey) return { isLogo: true, logo: logoDataUri(BRAND_LOGO_PATHS[logoKey]), key: logoKey };
  const emoji = brandEmoji(key);
  if (emoji) return { isLogo: false, emoji, key };
  return null;
}

/**
 * Icon for a subscription/merchant, always resolving to something. Returns a
 * real logo URL when one is bundled (caller renders an <img>), otherwise an
 * emoji string. `isLogo` tells the caller which it got.
 */
export function subscriptionIconInfo(name, category) {
  const brand = brandIconInfo(name);
  if (brand) return brand;
  return { isLogo: false, emoji: category === 'Subscriptions' ? '📱' : '🔁' };
}

/** Emoji-only convenience (per-brand → category → generic). */
export function subscriptionEmoji(nameOrKey, category) {
  const key = nameOrKey && /[^a-z0-9]/.test(nameOrKey) ? norm(nameOrKey) : (nameOrKey || '');
  const brand = brandEmoji(key);
  if (brand) return brand;
  if (category === 'Subscriptions') return '📱';
  return '🔁';
}
