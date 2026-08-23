import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

/*
 * `{@html}` is the one place Svelte hands raw markup to the DOM, and the app's
 * lists are full of names the user typed — which on a Family plan means names a
 * *different* member typed and shared (householdMerge.js folds another member's
 * cards and bills into the same collections this app renders).
 *
 * The dashboard's "Needs attention" alerts used to build HTML strings with card
 * and bill names interpolated raw, then render them with {@html}. That was
 * stored XSS across the household boundary, and the attacker controlled the
 * trigger too: their own balance/limit decides whether the utilization alert
 * fires, their own promo dates whether the promo one does.
 *
 * Every one of those alerts is plain text with a couple of bold runs, so none
 * of them needed markup at all. Keep it that way: if a component genuinely
 * needs {@html} some day, it has to escape at the point of interpolation, and
 * that decision should be argued for in review rather than slipped in.
 */
describe('svelte components — no raw-HTML sinks', () => {
  // Plain paths, not URL objects: this project runs under jsdom, whose global
  // `URL` shadows Node's, and node:fs rejects the result.
  const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'svelte');
  const files = readdirSync(dir).filter((f) => f.endsWith('.svelte'));

  /** Drop comments so the ban doesn't fire on prose describing the ban. */
  function stripComments(src) {
    return src
      .replace(/<!--[\s\S]*?-->/g, '')
      // Line comments only where `//` opens the line — never mid-line, so a
      // URL can't swallow real code that follows it on the same line.
      .replace(/^[ \t]*\/\/.*$/gm, '');
  }

  it('finds .svelte files to check', () => {
    expect(files.length).toBeGreaterThan(10);
  });

  it.each(files)('%s does not use {@html}', (file) => {
    const src = stripComments(readFileSync(path.join(dir, file), 'utf8'));
    expect(src).not.toContain('{@html');
  });

  it('still renders the dashboard alerts as escaped text', () => {
    const src = readFileSync(path.join(dir, 'DashboardView.svelte'), 'utf8');
    // The alert name is the user-controlled field; it must reach the template
    // as an interpolation, not as part of a pre-built string.
    expect(src).toContain('<strong>{a.name}</strong>');
    expect(src).not.toMatch(/html:\s*`/);
  });
});
