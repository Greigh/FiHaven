/* ═══════════════════════════════════════════════════════════
   subscriptionIcons.js — map a subscription / merchant name to a
   recognizable icon.

   Real SVG brand logos can be slotted into BRAND_LOGOS later (keyed by
   the same normalized name); until a logo exists we fall back to a
   per-brand emoji, then a category emoji, then a generic glyph. This
   keeps one lookup for the whole app (subscriptions panel, upcoming
   rows, spending), so bundling real logos later is a one-file change.
═══════════════════════════════════════════════════════════ */

/** Normalize a name for matching: lowercase, strip non-alphanumerics. */
function norm(name) {
  return (name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Real bundled logos go here later, keyed by normalized name →
 * a data-URI or imported asset URL. Empty for now; the emoji map covers it.
 * e.g. netflix: netflixLogoUrl
 */
export const BRAND_LOGOS = {};

/** Recognizable per-brand emoji stand-ins until real logos are bundled. */
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
  openbubbles: '💬', slack: '💬', discord: '💬', zoom: '🎥',
  microsoft365: '📎', office365: '📎', microsoft: '📎', google: '🔎', googleworkspace: '📎',
  linkedin: '💼', grammarly: '✍️', duolingo: '🦉', masterclass: '🎓', coursera: '🎓', skillshare: '🎓',
};

// Longest keys first so "applemusic" wins over "apple", "disneyplus" over "disney".
const BRANDS_BY_LEN = Object.keys(BRAND_EMOJI).sort((a, b) => b.length - a.length);

/**
 * Icon for a subscription/merchant. Returns a real logo URL when one is
 * bundled (caller can render an <img>), otherwise an emoji string.
 * `isLogo` in the result tells the caller which it got.
 */
export function subscriptionIconInfo(name, category) {
  const key = norm(name);
  if (BRAND_LOGOS[key]) return { logo: BRAND_LOGOS[key], isLogo: true };
  for (const brand of BRANDS_BY_LEN) {
    if (BRAND_LOGOS[brand] && key.includes(brand)) return { logo: BRAND_LOGOS[brand], isLogo: true };
  }
  return { emoji: subscriptionEmoji(key, category), isLogo: false };
}

/** Emoji-only convenience (per-brand → category → generic). */
export function subscriptionEmoji(nameOrKey, category) {
  const key = nameOrKey && /[^a-z0-9]/.test(nameOrKey) ? norm(nameOrKey) : (nameOrKey || '');
  if (BRAND_EMOJI[key]) return BRAND_EMOJI[key];
  for (const brand of BRANDS_BY_LEN) {
    if (key.includes(brand)) return BRAND_EMOJI[brand];
  }
  if (category === 'Subscriptions') return '📱';
  return '🔁';
}
