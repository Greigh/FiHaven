<!--
  MfaSection.svelte — Two-factor enrollment in Settings.
  Reads /api/account/mfa/status on mount, lets the user enroll
  TOTP (with QR code + backup codes shown once) and manage
  passkeys (WebAuthn).

  Every action that adds or removes a factor re-authenticates first.
  HOW it re-authenticates depends on the account: password accounts
  type their password; Sign in with Apple / Google accounts have no
  password, so they request a one-time code by email instead
  (`hasPassword` on /status says which). That single `reauth` state
  and the reauthFields snippet back all six prompts, so the two
  variants can't drift apart per-flow.
-->
<script>
  import { startRegistration, startAuthentication } from '@simplewebauthn/browser';

  const API = '/api/account/mfa';

  let status      = $state(null);
  let loading     = $state(true);
  let busy        = $state(false);
  let banner      = $state({ text: '', kind: 'info' });

  // TOTP enrollment flow state.
  let totpStep    = $state('idle'); // idle | reauth | verify | backup
  let totpUri     = $state('');
  let totpQr      = $state('');
  let totpSecret  = $state('');
  let totpCode    = $state('');
  let backupCodes = $state([]);

  // TOTP disable flow.
  let disableOpen   = $state(false);
  let disableCode   = $state('');

  // Regenerate backup codes.
  let regenOpen     = $state(false);
  let regenCode     = $state('');

  // Passkey add.
  let passkeyName   = $state('');
  // Set when register-start comes back needing re-auth, i.e. the session is
  // older than the server's grace window for enrolment.
  let passkeyReauthOpen = $state(false);

  // Passkey delete confirmation.
  let deletePkId    = $state(null);

  // Email-MFA enrollment.
  let emailEnrollStep  = $state('idle'); // idle | reauth | confirm
  let emailEnrollCode  = $state('');
  let emailEnrollChal  = $state('');
  let emailDisableOpen = $state(false);

  /* ── Re-auth: one state, two shapes ───────────────────────────
     Only one sensitive flow is open at a time, so a single object
     backs them all. `password` is used when the account has one;
     otherwise `code` holds the emailed confirmation code. */
  let reauth = $state({ password: '', code: '', sent: false, sending: false });

  const hasPassword = $derived(status ? status.hasPassword !== false : true);

  function resetReauth() {
    reauth = { password: '', code: '', sent: false, sending: false };
  }

  /** The credential fields to merge into a sensitive request body. */
  function reauthBody() {
    return hasPassword ? { password: reauth.password } : { reauthCode: reauth.code };
  }

  /** Whether the user has supplied enough to submit. */
  const reauthReady = $derived(
    hasPassword ? !!reauth.password : reauth.code.trim().length === 6
  );

  async function sendReauthCode() {
    reauth.sending = true;
    const res = await call('/reauth/send', { method: 'POST', body: {} });
    reauth.sending = false;
    if (!res.ok) { flash(errorText(res.data.error), 'error'); return; }
    reauth.sent = true;
    flash('Code sent — check your inbox.', 'success');
  }

  // Server responses that mean "re-authenticate and try again" rather than
  // "this operation failed".
  const REAUTH_ERRORS = new Set([
    'wrong-password',
    'reauth-code-required',
    'invalid-reauth-code',
    'reauth-code-expired',
    'reauth-too-many-attempts',
  ]);

  function flash(text, kind) {
    banner = { text, kind: kind || 'info' };
  }

  function csrf() {
    var auth = window.AppAuth;
    var t = auth && auth.getCsrfToken && auth.getCsrfToken();
    if (t) return Promise.resolve(t);
    return auth.me().then(() => auth.getCsrfToken());
  }

  async function call(path, opts) {
    opts = opts || {};
    const headers = Object.assign({}, opts.headers || {});
    if (opts.body !== undefined && !(opts.body instanceof FormData)) {
      headers['Content-Type'] = 'application/json';
    }
    if (opts.method && opts.method !== 'GET' && opts.method !== 'HEAD') {
      headers['X-CSRF-Token'] = await csrf();
    }
    const r = await fetch(API + path, {
      method: opts.method || 'GET',
      headers,
      credentials: 'same-origin',
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });
    const data = await r.json().catch(() => ({}));
    return { ok: r.ok, status: r.status, data };
  }

  async function refresh() {
    loading = true;
    const res = await call('/status');
    if (res.ok) status = res.data;
    loading = false;
  }
  refresh();

  function errorText(code) {
    switch (code) {
      case 'wrong-password':       return 'That password is incorrect.';
      case 'invalid-totp-code':    return 'That code didn’t match. Try again.';
      case 'totp-already-enabled': return 'Authenticator app is already enabled.';
      case 'totp-not-enabled':     return 'Authenticator app isn’t enabled.';
      case 'no-pending-setup':     return 'Start setup again — the previous attempt expired.';
      case 'bad-challenge':        return 'Sign-in challenge expired. Try again.';
      case 'passkey-verify-failed':return 'Passkey didn’t verify. Try a different device or method.';
      case 'bad-passkey-id':       return 'Passkey not found.';
      case 'mail-send-failed':     return 'We couldn’t send the email. Check your address or try again in a moment.';
      case 'email-mfa-not-enabled':return 'Email codes aren’t turned on for this account.';
      case 'invalid-code':         return 'That code didn’t match. Try again.';
      case 'challenge-expired':    return 'That code expired. Send a new one.';
      // Re-auth on an account with no password (Apple / Google sign-in).
      case 'reauth-code-required': return 'Send yourself a confirmation code, then enter it.';
      case 'invalid-reauth-code':  return 'That confirmation code is incorrect.';
      case 'reauth-code-expired':  return 'That confirmation code expired. Send a new one.';
      case 'reauth-too-many-attempts':
        return 'Too many incorrect codes. Send a new one.';
      case 'password-required':    return 'This account has a password — enter it instead.';
      default:                     return 'Something went wrong. Try again.';
    }
  }

  /* ── Email-MFA enroll / disable ──────────────────────────── */

  function startEmailEnroll() {
    emailEnrollStep = 'reauth';
    emailEnrollCode = '';
    resetReauth();
  }
  function cancelEmailEnroll() {
    emailEnrollStep = 'idle';
    emailEnrollCode = '';
    emailEnrollChal = '';
    resetReauth();
  }
  async function submitEmailEnroll() {
    busy = true;
    const res = await call('/email/enable', { method: 'POST', body: reauthBody() });
    busy = false;
    if (!res.ok) { flash(errorText(res.data.error), 'error'); return; }
    emailEnrollChal = res.data.challengeId;
    emailEnrollStep = 'confirm';
    resetReauth();
    flash('Code sent. Check your inbox.', 'success');
  }
  async function submitEmailConfirm() {
    busy = true;
    const res = await call('/email/confirm', {
      method: 'POST',
      body: { challengeId: emailEnrollChal, code: emailEnrollCode },
    });
    busy = false;
    if (!res.ok) { flash(errorText(res.data.error), 'error'); return; }
    cancelEmailEnroll();
    flash('Email codes enabled.', 'success');
    refresh();
  }
  async function submitEmailDisable() {
    busy = true;
    const res = await call('/email/disable', { method: 'POST', body: reauthBody() });
    busy = false;
    if (!res.ok) { flash(errorText(res.data.error), 'error'); return; }
    emailDisableOpen = false;
    resetReauth();
    flash('Email codes disabled.', 'success');
    refresh();
  }

  /* ── TOTP enroll ─────────────────────────────────────────── */

  function startTotpEnroll() {
    totpStep = 'reauth';
    totpCode = '';
    backupCodes = [];
    resetReauth();
    flash('', 'info');
  }

  async function submitTotpSetup() {
    busy = true;
    const res = await call('/totp/setup', { method: 'POST', body: reauthBody() });
    busy = false;
    if (!res.ok) { flash(errorText(res.data.error), 'error'); return; }
    totpUri    = res.data.uri;
    totpQr     = res.data.qrDataUrl;
    totpSecret = res.data.secret;
    totpStep   = 'verify';
    resetReauth();
    flash('', 'info');
  }

  async function submitTotpConfirm() {
    busy = true;
    const res = await call('/totp/confirm', { method: 'POST', body: { code: totpCode } });
    busy = false;
    if (!res.ok) { flash(errorText(res.data.error), 'error'); return; }
    backupCodes = res.data.backupCodes || [];
    totpStep = 'backup';
    flash('Authenticator app enabled. Save your backup codes — you’ll see them only once.', 'success');
    refresh();
  }

  function cancelTotpEnroll() {
    totpStep = 'idle';
    totpCode = '';
    totpSecret = '';
    totpUri = '';
    totpQr = '';
    resetReauth();
  }

  function copyBackupCodes() {
    const text = backupCodes.join('\n');
    navigator.clipboard.writeText(text).then(
      () => flash('Backup codes copied to clipboard.', 'success'),
      () => flash('Couldn’t copy automatically — select and copy them manually.', 'error'),
    );
  }

  /* ── TOTP disable ─────────────────────────────────────────── */

  async function submitTotpDisable() {
    busy = true;
    const res = await call('/totp/disable', {
      method: 'POST',
      body: Object.assign({ code: disableCode }, reauthBody()),
    });
    busy = false;
    if (!res.ok) { flash(errorText(res.data.error), 'error'); return; }
    disableOpen = false;
    disableCode = '';
    resetReauth();
    flash('Authenticator app disabled.', 'success');
    refresh();
  }

  /* ── Regenerate backup codes ───────────────────────────────── */

  async function submitRegen() {
    busy = true;
    const res = await call('/backup-codes/regenerate', {
      method: 'POST',
      body: Object.assign({ code: regenCode }, reauthBody()),
    });
    busy = false;
    if (!res.ok) { flash(errorText(res.data.error), 'error'); return; }
    backupCodes = res.data.backupCodes || [];
    regenOpen = false;
    regenCode = '';
    resetReauth();
    totpStep = 'backup'; // reuse the backup-display panel
    flash('New backup codes generated. The old ones no longer work.', 'success');
    refresh();
  }

  /* ── Passkey register ──────────────────────────────────────── */

  // `withReauth` is false on the first try: the server waives re-auth for a
  // session that was just established (the common case — you add a passkey
  // right after signing in), so asking up front would be pure friction. If it
  // declines, we surface the prompt and retry with credentials.
  async function addPasskey(withReauth) {
    busy = true;
    flash('', 'info');
    try {
      const start = await call('/passkey/register-start', {
        method: 'POST',
        body: withReauth ? reauthBody() : {},
      });
      if (!start.ok) {
        if (!withReauth && REAUTH_ERRORS.has(start.data.error)) {
          passkeyReauthOpen = true;
          resetReauth();
          flash('Confirm it’s you to add a passkey.', 'info');
          busy = false;
          return;
        }
        flash(errorText(start.data.error), 'error');
        busy = false;
        return;
      }
      let attResp;
      try {
        attResp = await startRegistration({ optionsJSON: start.data.options });
      } catch (err) {
        // User cancelled or device unsupported.
        flash(err && err.message ? err.message : 'Passkey creation was cancelled.', 'error');
        busy = false;
        return;
      }
      const finish = await call('/passkey/register-finish', {
        method: 'POST',
        body: {
          challengeId: start.data.challengeId,
          response: attResp,
          name: passkeyName || guessPasskeyLabel(),
        },
      });
      if (!finish.ok) { flash(errorText(finish.data.error), 'error'); busy = false; return; }
      passkeyName = '';
      passkeyReauthOpen = false;
      resetReauth();
      flash('Passkey added.', 'success');
      refresh();
    } finally {
      busy = false;
    }
  }

  function guessPasskeyLabel() {
    const ua = navigator.userAgent || '';
    if (/Mac OS X/.test(ua))   return 'Mac (Touch ID)';
    if (/iPhone|iPad/.test(ua))return 'iOS device';
    if (/Android/.test(ua))    return 'Android device';
    if (/Windows/.test(ua))    return 'Windows Hello';
    return 'Security key';
  }

  /* ── Passkey delete ────────────────────────────────────────── */

  async function submitDeletePasskey() {
    busy = true;
    const res = await call('/passkey/delete', {
      method: 'POST',
      body: Object.assign({ passkeyId: deletePkId }, reauthBody()),
    });
    busy = false;
    if (!res.ok) { flash(errorText(res.data.error), 'error'); return; }
    deletePkId = null;
    resetReauth();
    flash('Passkey removed.', 'success');
    refresh();
  }

  function fmtDate(ms) {
    if (!ms) return '—';
    return new Date(ms).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  }
</script>

<!--
  The re-auth control. Password accounts get a password field; accounts with
  no password (Sign in with Apple / Google) get a "send me a code" pair. Every
  sensitive panel renders this rather than its own copy.
-->
{#snippet reauthFields(id)}
  {#if hasPassword}
    <div class="auth-field">
      <label for="{id}-pwd">Password</label>
      <input id="{id}-pwd" type="password" autocomplete="current-password" bind:value={reauth.password}/>
    </div>
  {:else}
    <div class="auth-field">
      <label for="{id}-rc">Confirmation code</label>
      <div style="display:flex;gap:8px;align-items:center;">
        <input id="{id}-rc" type="text" inputmode="numeric" maxlength="6"
               autocomplete="one-time-code" placeholder="6 digits"
               style="flex:1;min-width:0;" bind:value={reauth.code}/>
        <button class="btn btn-ghost btn-sm" type="button" style="flex:0 0 auto;"
                disabled={reauth.sending} onclick={sendReauthCode}>
          {reauth.sending ? 'Sending…' : reauth.sent ? 'Resend' : 'Send code'}
        </button>
      </div>
      <p style="font-size:12px;color:var(--muted);margin-top:6px;">
        Your account signs in with Apple or Google, so there’s no password to
        confirm. We’ll email a code to <strong>{status?.emailMfa?.email || 'your address'}</strong> instead.
      </p>
    </div>
  {/if}
{/snippet}

<section class="auth-card" style="width:min(620px,100%);">
  <h2 style="font-size:20px;letter-spacing:-.03em;">Two-factor authentication</h2>
  <p style="margin-top:6px;color:var(--muted);font-size:14px;">
    Add a second factor so your password alone isn’t enough to sign in. Enroll an authenticator app (TOTP) or a passkey — both work, and you can use either at sign-in.
  </p>

  {#if banner.text}
    <div class="auth-error" style="color:{banner.kind === 'error' ? 'var(--red)' : banner.kind === 'success' ? 'var(--green)' : 'var(--muted)'};margin-top:10px;">
      {banner.text}
    </div>
  {/if}

  {#if loading}
    <p style="color:var(--muted);margin-top:14px;font-size:13px;">Loading status…</p>
  {:else if status}

    <!-- ── Status summary ───────────────────────────────────── -->
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:14px;">
      <div class="card" style="padding:12px;">
        <div class="section-title" style="font-size:11px;">Authenticator app</div>
        <div style="font-size:14px;font-weight:600;margin-top:4px;">
          {status.totp.enabled ? 'Enabled' : 'Not set up'}
        </div>
        {#if status.totp.enabled}
          <div style="font-size:11px;color:var(--muted);margin-top:2px;">
            Since {fmtDate(status.totp.enabledAt)}
          </div>
        {/if}
      </div>
      <div class="card" style="padding:12px;">
        <div class="section-title" style="font-size:11px;">Passkeys</div>
        <div style="font-size:14px;font-weight:600;margin-top:4px;">
          {status.passkeys.length} registered
        </div>
        {#if status.totp.enabled}
          <div style="font-size:11px;color:var(--muted);margin-top:2px;">
            Backup codes: {status.backupCodes.unused}/{status.backupCodes.total} unused
          </div>
        {/if}
      </div>
    </div>

    <!-- ── TOTP enrollment flow ─────────────────────────────── -->
    <div style="margin-top:18px;">
      <h3 style="font-size:14px;font-weight:700;letter-spacing:-.02em;">Authenticator app (TOTP)</h3>

      {#if !status.totp.enabled && totpStep === 'idle'}
        <p style="font-size:13px;color:var(--muted);margin-top:6px;">
          Use Google Authenticator, 1Password, Authy, or any TOTP-compatible app.
        </p>
        <div class="auth-actions" style="margin-top:10px;">
          <button class="btn btn-primary btn-sm" type="button" disabled={busy} onclick={startTotpEnroll}>
            Set up authenticator
          </button>
        </div>
      {/if}

      {#if totpStep === 'reauth'}
        <p style="font-size:13px;color:var(--muted);margin-top:6px;">Confirm it’s you to start setup.</p>
        <div style="margin-top:8px;">
          {@render reauthFields('totp')}
        </div>
        <div class="auth-actions" style="margin-top:8px;">
          <button class="btn btn-primary btn-sm" type="button" disabled={busy || !reauthReady} onclick={submitTotpSetup}>Continue</button>
          <button class="btn btn-ghost btn-sm" type="button" onclick={cancelTotpEnroll}>Cancel</button>
        </div>
      {/if}

      {#if totpStep === 'verify'}
        <p style="font-size:13px;color:var(--muted);margin-top:6px;">
          Scan this QR code in your authenticator app, then enter the 6-digit code it shows.
        </p>
        <div style="display:flex;gap:14px;align-items:flex-start;margin-top:10px;flex-wrap:wrap;">
          {#if totpQr}
            <img src={totpQr} alt="TOTP QR code" style="width:180px;height:180px;background:white;padding:6px;border-radius:8px;"/>
          {/if}
          <div style="flex:1;min-width:200px;">
            <div style="font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);">
              Can’t scan? Enter this key manually:
            </div>
            <div class="mono" style="background:var(--surface2,var(--surface));padding:8px;border-radius:6px;margin-top:4px;font-size:12px;word-break:break-all;">{totpSecret}</div>
          </div>
        </div>
        <div class="auth-field" style="margin-top:12px;">
          <label for="totp-code">6-digit code from app</label>
          <input id="totp-code" type="text" inputmode="numeric" pattern="[0-9]*" maxlength="6" autocomplete="one-time-code" bind:value={totpCode}/>
        </div>
        <div class="auth-actions" style="margin-top:8px;">
          <button class="btn btn-primary btn-sm" type="button" disabled={busy || totpCode.length !== 6} onclick={submitTotpConfirm}>Verify &amp; enable</button>
          <button class="btn btn-ghost btn-sm" type="button" onclick={cancelTotpEnroll}>Cancel</button>
        </div>
      {/if}

      {#if totpStep === 'backup' && backupCodes.length}
        <div class="card" style="padding:12px;margin-top:12px;border:1px solid var(--orange);">
          <div style="font-size:13px;font-weight:700;color:var(--orange);margin-bottom:8px;">
            ⚠ Save these backup codes — they’re shown only once.
          </div>
          <div class="mono" style="background:var(--surface2,var(--surface));padding:10px;border-radius:6px;display:grid;grid-template-columns:1fr 1fr;gap:4px 16px;font-size:13px;">
            {#each backupCodes as code}
              <div>{code}</div>
            {/each}
          </div>
          <div class="auth-actions" style="margin-top:10px;">
            <button class="btn btn-ghost btn-sm" type="button" onclick={copyBackupCodes}>Copy to clipboard</button>
            <button class="btn btn-primary btn-sm" type="button" onclick={() => { totpStep = 'idle'; backupCodes = []; }}>I’ve saved them</button>
          </div>
        </div>
      {/if}

      {#if status.totp.enabled && totpStep === 'idle'}
        <div class="auth-actions" style="margin-top:10px;">
          <button class="btn btn-ghost btn-sm" type="button" onclick={() => { regenOpen = true; disableOpen = false; }}>
            Regenerate backup codes
          </button>
          <button class="btn btn-danger btn-sm" type="button" onclick={() => { disableOpen = true; regenOpen = false; }}>
            Disable authenticator
          </button>
        </div>

        {#if regenOpen}
          <div class="card" style="padding:12px;margin-top:10px;">
            <p style="font-size:13px;color:var(--muted);">Confirm it’s you, plus a current TOTP code, to generate a new set.</p>
            {@render reauthFields('regen')}
            <div class="auth-field"><label for="regen-code">6-digit code</label>
              <input id="regen-code" type="text" inputmode="numeric" maxlength="6" autocomplete="one-time-code" bind:value={regenCode}/></div>
            <div class="auth-actions">
              <button class="btn btn-primary btn-sm" type="button" disabled={busy || !reauthReady || regenCode.length !== 6} onclick={submitRegen}>Regenerate</button>
              <button class="btn btn-ghost btn-sm" type="button" onclick={() => { regenOpen = false; regenCode = ''; resetReauth(); }}>Cancel</button>
            </div>
          </div>
        {/if}

        {#if disableOpen}
          <div class="card" style="padding:12px;margin-top:10px;border-color:var(--red);">
            <p style="font-size:13px;color:var(--muted);">Disabling requires confirming it’s you AND a current TOTP code.</p>
            {@render reauthFields('dis')}
            <div class="auth-field"><label for="dis-code">6-digit code</label>
              <input id="dis-code" type="text" inputmode="numeric" maxlength="6" autocomplete="one-time-code" bind:value={disableCode}/></div>
            <div class="auth-actions">
              <button class="btn btn-danger btn-sm" type="button" disabled={busy || !reauthReady || disableCode.length !== 6} onclick={submitTotpDisable}>Disable</button>
              <button class="btn btn-ghost btn-sm" type="button" onclick={() => { disableOpen = false; disableCode = ''; resetReauth(); }}>Cancel</button>
            </div>
          </div>
        {/if}
      {/if}
    </div>

    <!-- ── Passkeys ─────────────────────────────────────────── -->
    <div style="margin-top:22px;">
      <h3 style="font-size:14px;font-weight:700;letter-spacing:-.02em;">Passkeys</h3>
      <p style="font-size:13px;color:var(--muted);margin-top:6px;">
        Touch ID, Face ID, Windows Hello, or a hardware security key. Sign in without typing a password.
      </p>

      {#if status.passkeys.length}
        <ul style="list-style:none;padding:0;margin:10px 0 0;display:flex;flex-direction:column;gap:6px;">
          {#each status.passkeys as p (p.id)}
            <li style="display:flex;justify-content:space-between;align-items:center;gap:10px;padding:8px 12px;border:1px solid var(--border);border-radius:8px;">
              <div>
                <div style="font-size:14px;font-weight:600;">{p.name || 'Passkey'}</div>
                <div style="font-size:11px;color:var(--muted);">
                  Added {fmtDate(p.createdAt)} · last used {fmtDate(p.lastUsedAt)}
                </div>
              </div>
              <button class="btn btn-ghost btn-xs" type="button" onclick={() => { deletePkId = p.id; resetReauth(); }}>Remove</button>
            </li>
          {/each}
        </ul>
      {/if}

      <div style="display:flex;gap:8px;align-items:flex-end;margin-top:12px;flex-wrap:wrap;">
        <div class="auth-field" style="flex:1;min-width:200px;margin:0;">
          <label for="pk-name">Label (optional)</label>
          <input id="pk-name" type="text" maxlength="60" placeholder="e.g. MacBook Touch ID" bind:value={passkeyName}/>
        </div>
        <button class="btn btn-primary btn-sm" type="button" disabled={busy} onclick={() => addPasskey(false)}>+ Add passkey</button>
      </div>

      {#if passkeyReauthOpen}
        <div class="card" style="padding:12px;margin-top:10px;">
          <p style="font-size:13px;color:var(--muted);">
            You’ve been signed in a while, so confirm it’s you before adding a passkey.
          </p>
          {@render reauthFields('addpk')}
          <div class="auth-actions">
            <button class="btn btn-primary btn-sm" type="button" disabled={busy || !reauthReady} onclick={() => addPasskey(true)}>Continue</button>
            <button class="btn btn-ghost btn-sm" type="button" onclick={() => { passkeyReauthOpen = false; resetReauth(); }}>Cancel</button>
          </div>
        </div>
      {/if}

      {#if deletePkId}
        <div class="card" style="padding:12px;margin-top:10px;border-color:var(--red);">
          <p style="font-size:13px;color:var(--muted);">Confirm it’s you to remove this passkey.</p>
          {@render reauthFields('dpk')}
          <div class="auth-actions">
            <button class="btn btn-danger btn-sm" type="button" disabled={busy || !reauthReady} onclick={submitDeletePasskey}>Remove passkey</button>
            <button class="btn btn-ghost btn-sm" type="button" onclick={() => { deletePkId = null; resetReauth(); }}>Cancel</button>
          </div>
        </div>
      {/if}
    </div>

    <!-- ── Email codes ──────────────────────────────────────── -->
    <div style="margin-top:22px;">
      <h3 style="font-size:14px;font-weight:700;letter-spacing:-.02em;">Email codes</h3>
      <p style="font-size:13px;color:var(--muted);margin-top:6px;">
        Receive a one-time 6-digit code at <strong>{status.emailMfa.email || '—'}</strong> when you sign in. Weaker than an authenticator app or passkey, but useful as a fallback.
      </p>

      {#if !status.emailMfa.enabled && emailEnrollStep === 'idle'}
        <div class="auth-actions" style="margin-top:8px;">
          <button class="btn btn-primary btn-sm" type="button" disabled={busy} onclick={startEmailEnroll}>Set up email codes</button>
        </div>
      {/if}

      {#if emailEnrollStep === 'reauth'}
        <p style="font-size:13px;color:var(--muted);margin-top:6px;">Confirm it’s you and we’ll send a verification code to your email.</p>
        {@render reauthFields('em')}
        <div class="auth-actions">
          <button class="btn btn-primary btn-sm" type="button" disabled={busy || !reauthReady} onclick={submitEmailEnroll}>Send code</button>
          <button class="btn btn-ghost btn-sm" type="button" onclick={cancelEmailEnroll}>Cancel</button>
        </div>
      {/if}

      {#if emailEnrollStep === 'confirm'}
        <p style="font-size:13px;color:var(--muted);margin-top:6px;">Enter the 6-digit code we just sent to <strong>{status.emailMfa.email}</strong>.</p>
        <div class="auth-field"><label for="em-code">Code</label>
          <input id="em-code" type="text" inputmode="numeric" maxlength="6" autocomplete="one-time-code" bind:value={emailEnrollCode}/></div>
        <div class="auth-actions">
          <button class="btn btn-primary btn-sm" type="button" disabled={busy || emailEnrollCode.length !== 6} onclick={submitEmailConfirm}>Verify &amp; enable</button>
          <button class="btn btn-ghost btn-sm" type="button" onclick={cancelEmailEnroll}>Cancel</button>
        </div>
      {/if}

      {#if status.emailMfa.enabled && emailEnrollStep === 'idle'}
        <div class="auth-actions" style="margin-top:8px;">
          <button class="btn btn-danger btn-sm" type="button" onclick={() => { emailDisableOpen = true; resetReauth(); }}>Disable email codes</button>
        </div>
        {#if emailDisableOpen}
          <div class="card" style="padding:12px;margin-top:10px;border-color:var(--red);">
            <p style="font-size:13px;color:var(--muted);">Confirm it’s you to disable email codes.</p>
            {@render reauthFields('em-dis')}
            <div class="auth-actions">
              <button class="btn btn-danger btn-sm" type="button" disabled={busy || !reauthReady} onclick={submitEmailDisable}>Disable</button>
              <button class="btn btn-ghost btn-sm" type="button" onclick={() => { emailDisableOpen = false; resetReauth(); }}>Cancel</button>
            </div>
          </div>
        {/if}
      {/if}
    </div>
  {/if}
</section>
