/* ═══════════════════════════════════════════════════════════
   merchants.js — merchant → spend-category hints.

   A tiny keyword table that guesses which REWARD_CATEGORY a
   merchant name belongs to ("Starbucks" → Dining, "Shell" →
   Gas). It powers two things:
     • the optimizer's "you shopped at <merchant> — that's
       <category>, best card is X" nudge, and
     • the spend-based rewards estimate (categorizing a user's
       transactions so we can total spend per reward category).

   This is a hint, never a hard classification: an unknown
   merchant returns null and the caller falls back to whatever
   category the transaction already carries. Patterns are matched
   as lowercase substrings, most-specific first.

   Categories returned are exactly the REWARD_CATEGORIES the
   optimizer ranks (utils.js). Mirrored by Merchants.swift /
   Merchants.kt — change all three together.
═══════════════════════════════════════════════════════════ */

// [substring, category] pairs. Order matters: the FIRST match wins, so
// list more-specific merchants before broad keywords ("whole foods"
// before "food"). Categories must be REWARD_CATEGORIES values.
export const MERCHANT_HINTS = [
  // Groceries
  ['whole foods', 'Groceries'], ['trader joe', 'Groceries'], ['safeway', 'Groceries'],
  ['kroger', 'Groceries'], ['publix', 'Groceries'], ['aldi', 'Groceries'],
  ['wegmans', 'Groceries'], ['costco', 'Groceries'], ['sam\'s club', 'Groceries'],
  ['heb', 'Groceries'], ['h-e-b', 'Groceries'], ['sprouts', 'Groceries'],
  ['food lion', 'Groceries'], ['giant', 'Groceries'], ['supermarket', 'Groceries'],
  ['grocery', 'Groceries'],
  // Gas
  ['shell', 'Gas'], ['chevron', 'Gas'], ['exxon', 'Gas'], ['mobil', 'Gas'],
  ['bp ', 'Gas'], ['texaco', 'Gas'], ['valero', 'Gas'], ['marathon', 'Gas'],
  ['speedway', 'Gas'], ['arco', 'Gas'], ['sunoco', 'Gas'], ['citgo', 'Gas'],
  ['gas station', 'Gas'], ['fuel', 'Gas'], ['phillips 66', 'Gas'],
  // Transit / rideshare
  ['uber', 'Transit'], ['lyft', 'Transit'], ['metro', 'Transit'],
  ['transit', 'Transit'], ['parking', 'Transit'], ['toll', 'Transit'],
  ['mta', 'Transit'], ['bart', 'Transit'], ['amtrak', 'Transit'],
  ['subway tran', 'Transit'],
  // Travel
  ['airline', 'Travel'], ['airlines', 'Travel'], ['hotel', 'Travel'],
  ['marriott', 'Travel'], ['hilton', 'Travel'], ['hyatt', 'Travel'],
  ['airbnb', 'Travel'], ['expedia', 'Travel'], ['delta', 'Travel'],
  ['united air', 'Travel'], ['american air', 'Travel'], ['southwest', 'Travel'],
  ['booking.com', 'Travel'], ['airport', 'Travel'], ['rental car', 'Travel'],
  ['hertz', 'Travel'], ['enterprise rent', 'Travel'],
  // Streaming
  ['netflix', 'Streaming'], ['spotify', 'Streaming'], ['hulu', 'Streaming'],
  ['disney+', 'Streaming'], ['disney plus', 'Streaming'], ['hbo', 'Streaming'],
  ['max.com', 'Streaming'], ['youtube premium', 'Streaming'], ['youtube tv', 'Streaming'],
  ['apple music', 'Streaming'], ['paramount+', 'Streaming'], ['peacock', 'Streaming'],
  ['audible', 'Streaming'], ['pandora', 'Streaming'],
  // Drugstores
  ['cvs', 'Drugstores'], ['walgreens', 'Drugstores'], ['rite aid', 'Drugstores'],
  ['pharmacy', 'Drugstores'], ['drugstore', 'Drugstores'], ['duane reade', 'Drugstores'],
  // Online shopping
  ['amazon', 'Online shopping'], ['ebay', 'Online shopping'], ['etsy', 'Online shopping'],
  ['paypal', 'Online shopping'], ['wayfair', 'Online shopping'], ['shopify', 'Online shopping'],
  ['aliexpress', 'Online shopping'], ['temu', 'Online shopping'], ['chewy', 'Online shopping'],
  // Dining — last among specifics, before nothing
  ['starbucks', 'Dining'], ['dunkin', 'Dining'], ['mcdonald', 'Dining'],
  ['chipotle', 'Dining'], ['doordash', 'Dining'], ['grubhub', 'Dining'],
  ['ubereats', 'Dining'], ['uber eats', 'Dining'], ['restaurant', 'Dining'],
  ['cafe', 'Dining'], ['coffee', 'Dining'], ['pizza', 'Dining'], ['grill', 'Dining'],
  ['kitchen', 'Dining'], ['taqueria', 'Dining'], ['bakery', 'Dining'],
  ['bar & grill', 'Dining'], ['diner', 'Dining'], ['panera', 'Dining'],
  ['subway', 'Dining'], ['wendy', 'Dining'], ['taco bell', 'Dining'],
  ['burger', 'Dining'],
];

// Guess the REWARD_CATEGORY for a merchant name, or null when nothing
// matches. Case-insensitive substring match, first hint wins.
export function merchantCategory(merchant) {
  if (!merchant) return null;
  const m = String(merchant).toLowerCase();
  for (const [needle, category] of MERCHANT_HINTS) {
    if (m.includes(needle)) return category;
  }
  return null;
}
