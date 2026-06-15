import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { attachPasswordToggles } from './passwordToggle.js';

// Render markup into the body and return the first password input.
function mount(html) {
  document.body.innerHTML = html;
}

describe('passwordToggle — attachPasswordToggles', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('wraps a password input and appends a toggle button', () => {
    mount('<form><input id="pw" type="password"></form>');
    attachPasswordToggles();

    const input = document.getElementById('pw');
    const wrap = input.parentNode;
    expect(wrap.classList.contains('pw-wrap')).toBe(true);

    const btn = wrap.querySelector('.pw-toggle');
    expect(btn).not.toBeNull();
    expect(btn.type).toBe('button'); // never submits the form
    expect(btn.getAttribute('aria-label')).toBe('Show password');
    // Eye (not eye-off) icon to start: a plain circle pupil, no slash line.
    expect(btn.querySelector('line')).toBeNull();
    expect(btn.querySelector('circle')).not.toBeNull();
  });

  it('toggles the input type and swaps the icon/label on click', () => {
    mount('<input id="pw" type="password">');
    attachPasswordToggles();

    const input = document.getElementById('pw');
    const btn = input.parentNode.querySelector('.pw-toggle');

    btn.click();
    expect(input.type).toBe('text');
    expect(btn.getAttribute('aria-label')).toBe('Hide password');
    expect(btn.querySelector('line')).not.toBeNull(); // eye-off has a slash

    btn.click();
    expect(input.type).toBe('password');
    expect(btn.getAttribute('aria-label')).toBe('Show password');
    expect(btn.querySelector('line')).toBeNull();
  });

  it('is idempotent — does not double-wrap on repeated calls', () => {
    mount('<input id="pw" type="password">');
    attachPasswordToggles();
    attachPasswordToggles();
    attachPasswordToggles();

    expect(document.querySelectorAll('.pw-wrap')).toHaveLength(1);
    expect(document.querySelectorAll('.pw-toggle')).toHaveLength(1);
    expect(document.getElementById('pw').dataset.pwToggle).toBe('1');
  });

  it('attaches a separate toggle to every password input', () => {
    mount(
      '<input id="a" type="password">' +
        '<input id="b" type="password">' +
        '<input id="c" type="text">',
    );
    attachPasswordToggles();

    expect(document.querySelectorAll('.pw-toggle')).toHaveLength(2);
    // The text input is untouched.
    const text = document.getElementById('c');
    expect(text.parentNode.classList.contains('pw-wrap')).toBe(false);

    // Each toggle drives only its own input.
    const aBtn = document.getElementById('a').parentNode.querySelector('.pw-toggle');
    aBtn.click();
    expect(document.getElementById('a').type).toBe('text');
    expect(document.getElementById('b').type).toBe('password');
  });

  it('scopes to the provided root element', () => {
    mount(
      '<div id="inside"><input id="in" type="password"></div>' +
        '<input id="out" type="password">',
    );
    const root = document.getElementById('inside');
    attachPasswordToggles(root);

    expect(document.getElementById('in').dataset.pwToggle).toBe('1');
    expect(document.getElementById('out').dataset.pwToggle).toBeUndefined();
  });

  it('preserves the input element (and its value) when wrapping', () => {
    mount('<input id="pw" type="password" value="hunter2">');
    const before = document.getElementById('pw');
    attachPasswordToggles();
    const after = document.getElementById('pw');

    expect(after).toBe(before); // same node, just re-parented
    expect(after.value).toBe('hunter2');
  });
});
