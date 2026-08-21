import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';

/*
  Income ↔ bank sync.

  A bank sync is not just "new transactions appear": `syncBanks` asks the server
  to merge into the stored blob and then adopts the whole result, settings and
  all — and income sources and adjustments live in settings. That makes income
  the part of the app most exposed to getting the ordering wrong, in two ways
  this file pins down:

    1. The Income tab must render whatever the store holds NOW. It is mounted
       once per session and never re-mounted, so a copy taken at mount time goes
       stale the moment a sync replaces `settings` — and the next keystroke
       writes that stale copy back over the fresher server data.

    2. A local edit that has not reached the server yet must be pushed BEFORE
       the refresh runs, because the merge happens against the stored blob. If
       the push cannot land, the sync is skipped rather than allowed to
       overwrite the edit.
*/

async function loadModules() {
  const storage = await import('../../client/js/storage.svelte.js');
  const IncomeView = (await import('../../client/svelte/IncomeView.svelte')).default;
  return { storage, IncomeView };
}

const SOURCE = (id, label, amount) => ({ id, label, amount, frequency: 'monthly' });

describe('integration — the Income tab tracks a bank sync', () => {
  let target;
  let component;
  let storage;

  beforeEach(async () => {
    localStorage.clear();
    document.body.innerHTML = '';
    target = document.createElement('div');
    document.body.appendChild(target);
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({}) })));
    window.AppAuth = { getCsrfToken: () => 'csrf-token' };

    const mods = await loadModules();
    storage = mods.storage;
    storage.setSettings({ incomes: [SOURCE('src-a', 'Acme', 3000)] });
    component = mount(mods.IncomeView, { target });
    flushSync();
  });

  afterEach(() => {
    if (component) unmount(component);
    component = null;
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
    localStorage.clear();
  });

  const rows = () => target.querySelectorAll('.budget-income-list .budget-income-row');
  const labelInput = (id) => target.querySelector(`#income-label-${id}`);

  it('shows a paycheck that arrived with the pulled server copy', () => {
    expect(rows()).toHaveLength(1);

    // What pullFromServer() does after the bank refresh: replace settings
    // wholesale with the server's copy, which here has a second paycheck added
    // from another device.
    storage.setSettings({
      incomes: [SOURCE('src-a', 'Acme', 3000), SOURCE('src-b', 'Partner', 2000)],
    });
    flushSync();

    expect(rows()).toHaveLength(2);
    expect(labelInput('src-b').value).toBe('Partner');
    // The list and the footer total read the same source, so they agree.
    expect(target.textContent).toContain('$5,000');
  });

  it('drops a paycheck the server copy no longer has', () => {
    storage.setSettings({ incomes: [SOURCE('src-b', 'Partner', 2000)] });
    flushSync();

    expect(rows()).toHaveLength(1);
    expect(labelInput('src-a')).toBeNull();
    expect(labelInput('src-b').value).toBe('Partner');
  });

  it('edits after a sync build on the pulled copy instead of overwriting it', () => {
    storage.setSettings({
      incomes: [SOURCE('src-a', 'Acme', 3000), SOURCE('src-b', 'Partner', 2000)],
    });
    flushSync();

    // Type into the row that was already on screen before the sync. The edit
    // must not carry the pre-sync list back with it.
    const input = labelInput('src-a');
    input.value = 'Acme Corp';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    flushSync();

    expect(storage.settings.incomes.map((s) => s.label)).toEqual(['Acme Corp', 'Partner']);
    expect(storage.settings.income).toBe(5000);
    expect(rows()).toHaveLength(2);
  });

  it('keeps an adjustment that arrived with the pulled copy', () => {
    const mk = new Date().toISOString().slice(0, 7);
    storage.setSettings({
      incomes: [SOURCE('src-a', 'Acme', 3000)],
      incomeAdjustments: [{ id: 'adj-1', label: 'Bonus', amount: 500, kind: 'once', monthKey: mk }],
    });
    flushSync();

    expect(target.querySelector('#adj-label-adj-1').value).toBe('Bonus');

    // Editing a paycheck writes settings.incomes; it must leave the freshly
    // pulled adjustments alone.
    const input = labelInput('src-a');
    input.value = 'Acme Corp';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    flushSync();

    expect(storage.settings.incomeAdjustments).toHaveLength(1);
    expect(storage.settings.incomeAdjustments[0].label).toBe('Bonus');
  });
});

describe('integration — a bank sync never merges over an unsynced income edit', () => {
  let storage;
  let syncBanks;
  let calls;

  async function setup(putOk) {
    vi.resetModules();
    localStorage.clear();
    localStorage.setItem('fh_data_owner', 'a@b.test');
    calls = [];
    vi.stubGlobal('fetch', vi.fn((url, init) => {
      calls.push(`${(init && init.method) || 'GET'} ${url}`);
      if (url === '/api/data' && init && init.method === 'PUT') {
        return Promise.resolve({ ok: putOk, status: putOk ? 200 : 500 });
      }
      if (url === '/api/plaid/refresh') {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ items: [{ id: 'i1' }] }) });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({
        bills: [{ id: 'b-server', name: 'Added elsewhere', amount: 42 }],
        settings: { income: 99 },
      }) });
    }));
    window.AppAuth = { getCsrfToken: () => 'csrf-token' };

    storage = await import('../../client/js/storage.svelte.js');
    ({ syncBanks } = await import('../../client/js/bankSync.js'));
    storage.setEntitlement({ pro: true });
    storage.setSettings({ incomes: [SOURCE('src-a', 'Acme', 3000)] });
  }

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('pushes the queued edit before asking the server to merge', async () => {
    await setup(true);

    // A paycheck edited seconds ago: written locally, still inside the 800ms
    // debounce, so the server's copy does not have it yet.
    storage.settings.incomes = [SOURCE('src-a', 'Acme', 4200)];
    storage.save('fh_settings', storage.settings);

    const pulled = await syncBanks();

    expect(calls[0]).toBe('PUT /api/data');           // our edit goes up first…
    expect(calls[1]).toBe('POST /api/plaid/refresh'); // …so the merge sees it
    expect(calls[2]).toBe('GET /api/data');
    expect(pulled).toBe(true);
  });

  it('syncs anyway when the push failed — the pull reconciles rather than overwrites', async () => {
    await setup(false);

    storage.settings.incomes = [SOURCE('src-a', 'Acme', 4200)];
    storage.save('fh_settings', storage.settings);

    await syncBanks();

    // The refresh still runs: the bank's rows are worth having, and the pull
    // that follows merges rather than adopting wholesale.
    expect(calls).toEqual([
      'PUT /api/data',            // the flush, which fails
      'POST /api/plaid/refresh',
      'PUT /api/data',            // the pull retries the owed write first
      'GET /api/data',
    ]);
    // The edit is untouched and still flagged for the next attempt.
    expect(storage.settings.incomes[0].amount).toBe(4200);
    expect(storage.hasUnsyncedEdits()).toBe(true);
  });

  it('unions both sides when it has no baseline, rather than adopting nothing', async () => {
    await setup(false);

    storage.settings.incomes = [SOURCE('src-a', 'Acme', 4200)];
    storage.save('fh_settings', storage.settings);

    // Nothing has ever been agreed with the server here, so there is no common
    // ancestor. Merging against an empty one makes every record on either side
    // read as an addition: the union, which drops nothing.
    const server = await storage.pullFromServer();

    expect(server).not.toBeNull();
    expect(storage.settings.incomes[0].amount).toBe(4200);        // local work stands
    expect(storage.bills.map((b) => b.id)).toEqual(['b-server']); // the server's lands
    // Said out loud, because a union cannot express a deletion.
    expect(storage.lastSyncConservative()).toBe(true);
  });
});

/*
  Recovering from a failed write.

  pullFromServer refuses to adopt the server's copy while this device still
  holds edits the server hasn't taken — which is right, but only survives as a
  policy if the device actually keeps trying to hand those edits over. A push
  that fails leaves the pending marker set with no timer armed, so nothing is
  scheduled to retry it; without the retry below such a device would refuse to
  pull forever, silently.
*/
describe('integration — a device that failed to push does not stay wedged', () => {
  let storage;
  let syncBanks;
  let calls;
  let putResponses;
  let tokens;

  async function setup() {
    vi.resetModules();
    localStorage.clear();
    localStorage.setItem('fh_data_owner', 'a@b.test');
    document.body.innerHTML = '<span id="sync-status"></span>';
    calls = [];
    vi.stubGlobal('fetch', vi.fn((url, init) => {
      const method = (init && init.method) || 'GET';
      calls.push(`${method} ${url}`);
      if (url === '/api/data' && method === 'PUT') {
        const status = putResponses.shift();
        return Promise.resolve({ ok: status >= 200 && status < 300, status });
      }
      if (url === '/api/plaid/refresh') {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ items: [{ id: 'i1' }] }) });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ settings: { income: 99 } }) });
    }));
    tokens = ['csrf-token'];
    window.AppAuth = {
      getCsrfToken: () => tokens[0],
      me: () => { tokens.shift(); return Promise.resolve({}); },
    };

    storage = await import('../../client/js/storage.svelte.js');
    ({ syncBanks } = await import('../../client/js/bankSync.js'));
    storage.setEntitlement({ pro: true });
    storage.setSettings({ incomes: [SOURCE('src-a', 'Acme', 3000)] });
  }

  function editIncome(amount) {
    storage.settings.incomes = [SOURCE('src-a', 'Acme', amount)];
    storage.save('fh_settings', storage.settings);
  }

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
    document.body.innerHTML = '';
  });

  it('retries an owed write that nothing is scheduled to retry', async () => {
    await setup();
    putResponses = [500, 200];

    editIncome(4200);
    await storage.flushLocalWrites();
    expect(calls).toEqual(['PUT /api/data']);
    expect(storage.hasUnsyncedEdits()).toBe(true);

    // The debounce timer fired and failed, so nothing is armed and the user has
    // not typed again. Flushing has to retry on its own or the write is stuck —
    // and a stuck write used to mean a device that never pulled again either.
    await storage.flushLocalWrites();
    expect(calls).toEqual(['PUT /api/data', 'PUT /api/data']);
    expect(storage.hasUnsyncedEdits()).toBe(false);
    expect(storage.syncBlockedReason()).toBeNull();
  });

  it('recovers a rotated CSRF token instead of 403-ing forever', async () => {
    await setup();
    putResponses = [403, 200];
    tokens = ['stale-token', 'fresh-token'];

    editIncome(4200);
    await storage.flushLocalWrites();

    expect(calls).toEqual(['PUT /api/data', 'PUT /api/data']);
    expect(fetch.mock.calls[0][1].headers['X-CSRF-Token']).toBe('stale-token');
    expect(fetch.mock.calls[1][1].headers['X-CSRF-Token']).toBe('fresh-token');
    expect(storage.hasUnsyncedEdits()).toBe(false);
  });

  it('calls a refused write refused, and says so, rather than retrying blindly', async () => {
    await setup();
    putResponses = [413, 413];

    editIncome(4200);
    await syncBanks();

    // 413 is the server answering, not the network failing: the dataset is over
    // the 256kb cap and the same body will always be refused.
    expect(storage.syncBlockedReason()).toBe('rejected');
    expect(document.getElementById('sync-status').textContent)
      .toBe('Not saved — this device is out of sync');
    expect(document.getElementById('sync-status').dataset.state).toBe('rejected');
    // The edit is still here — a refused write is not a lost one.
    expect(storage.settings.incomes[0].amount).toBe(4200);
    expect(storage.hasUnsyncedEdits()).toBe(true);
  });

  it('never puts two writes on the wire at once', async () => {
    await setup();
    putResponses = [200, 200];

    editIncome(4200);
    const a = storage.flushLocalWrites();
    const b = storage.flushLocalWrites();
    await Promise.all([a, b]);

    // The second flush found nothing owed once the first had cleared it.
    expect(calls.filter((c) => c === 'PUT /api/data')).toHaveLength(1);
  });
});

/*
  The reconciliation itself, end to end.

  This is the case the whole thing exists for: this device added a paycheck and
  has not managed to push it, while the server's copy has moved on — the bank
  imported transactions, and another device renamed something. Neither copy is
  a superset of the other, so adopting either one loses work. The three-way
  merge keeps both and pushes the result.
*/
describe('integration — a bank sync reconciles with unsynced income edits', () => {
  let storage;
  let syncBanks;
  let calls;
  let putStatus;
  let serverData;

  const BASE_INCOME = { id: 'src-a', label: 'Acme', amount: 3000, frequency: 'monthly' };

  async function setup() {
    vi.resetModules();
    localStorage.clear();
    localStorage.setItem('fh_data_owner', 'a@b.test');
    document.body.innerHTML = '';
    calls = [];
    putStatus = 200;
    vi.stubGlobal('fetch', vi.fn((url, init) => {
      const method = (init && init.method) || 'GET';
      calls.push({ call: `${method} ${url}`, body: init && init.body });
      if (url === '/api/data' && method === 'PUT') {
        return Promise.resolve({ ok: putStatus < 300, status: putStatus });
      }
      if (url === '/api/plaid/refresh') {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ items: [{ id: 'i1' }] }) });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve(serverData) });
    }));
    window.AppAuth = { getCsrfToken: () => 'csrf-token', me: () => Promise.resolve({}) };

    storage = await import('../../client/js/storage.svelte.js');
    ({ syncBanks } = await import('../../client/js/bankSync.js'));
    storage.setEntitlement({ pro: true });

    // Establish a baseline the honest way: load a state, push it, have the
    // server accept it. That agreed state is what the merge measures against.
    storage.setSettings({ incomes: [{ ...BASE_INCOME }] });
    storage.setTransactions([]);
    storage.setBills([{ id: 'b1', name: 'Rent', amount: 1500 }]);
    storage.save('fh_settings', storage.settings);
    await storage.flushLocalWrites();
    expect(storage.hasUnsyncedEdits()).toBe(false);
    calls.length = 0;
  }

  const names = () => calls.map((c) => c.call);
  const lastPutBody = () => {
    const puts = calls.filter((c) => c.call === 'PUT /api/data');
    return puts.length ? JSON.parse(puts[puts.length - 1].body) : null;
  };

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('keeps the unpushed paycheck AND the transactions the bank imported', async () => {
    await setup();

    // Meanwhile, server-side: the bank sync imported a purchase, and another
    // device renamed the rent bill.
    serverData = {
      bills: [{ id: 'b1', name: 'Rent + parking', amount: 1500 }],
      transactions: [{ id: 'plaid-1', amount: 12, merchant: 'Coffee', source: 'plaid' }],
      settings: { incomes: [{ ...BASE_INCOME }] },
    };

    // Here: a second paycheck, and the push cannot get through.
    putStatus = 500;
    storage.settings.incomes = [{ ...BASE_INCOME }, { id: 'src-b', label: 'Side', amount: 500, frequency: 'monthly' }];
    storage.save('fh_settings', storage.settings);

    await syncBanks();

    // Both sides survive.
    expect(storage.settings.incomes.map((s) => s.id)).toEqual(['src-a', 'src-b']);
    expect(storage.transactions.map((t) => t.id)).toEqual(['plaid-1']);
    expect(storage.bills[0].name).toBe('Rent + parking');
    expect(storage.lastSyncConflicts()).toEqual([]);
  });

  it('pushes the reconciled result so the server converges too', async () => {
    await setup();
    serverData = {
      bills: [{ id: 'b1', name: 'Rent', amount: 1500 }],
      transactions: [{ id: 'plaid-1', amount: 12, source: 'plaid' }],
      settings: { incomes: [{ ...BASE_INCOME }] },
    };

    putStatus = 500;
    storage.settings.incomes = [{ ...BASE_INCOME }, { id: 'src-b', label: 'Side', amount: 500, frequency: 'monthly' }];
    storage.save('fh_settings', storage.settings);
    await syncBanks();

    // The merge is only on this device until it is written back.
    putStatus = 200;
    await storage.flushLocalWrites();

    const body = lastPutBody();
    expect(body.settings.incomes.map((s) => s.id)).toEqual(['src-a', 'src-b']);
    expect(body.transactions.map((t) => t.id)).toEqual(['plaid-1']);
    expect(storage.hasUnsyncedEdits()).toBe(false);
  });

  it('keeps the local value and names the field when both sides moved one', async () => {
    await setup();
    serverData = {
      bills: [{ id: 'b1', name: 'Rent', amount: 1800 }],
      transactions: [],
      settings: { incomes: [{ ...BASE_INCOME }] },
    };

    putStatus = 500;
    storage.bills[0].amount = 1700;
    storage.save('fh_bills', storage.bills);
    await syncBanks();

    expect(storage.bills[0].amount).toBe(1700);            // the device in hand wins
    expect(storage.lastSyncConflicts()).toEqual(['bills.amount']);
  });

  it('does not resurrect a record this device deleted', async () => {
    await setup();
    serverData = {
      bills: [{ id: 'b1', name: 'Rent', amount: 1500 }],
      transactions: [],
      settings: { incomes: [{ ...BASE_INCOME }] },
    };

    putStatus = 500;
    storage.setBills([]);
    storage.save('fh_bills', storage.bills);
    await syncBanks();

    expect(storage.bills).toEqual([]);
  });

  it('leaves the server-owned balance queue alone', async () => {
    await setup();
    serverData = {
      bills: [{ id: 'b1', name: 'Rent', amount: 1500 }],
      transactions: [],
      settings: {
        incomes: [{ ...BASE_INCOME }],
        plaidBalanceProposals: [{ fingerprint: 'f-new', id: 'c1' }],
      },
    };

    putStatus = 500;
    storage.settings.incomes = [{ ...BASE_INCOME }, { id: 'src-b', label: 'Side', amount: 500, frequency: 'monthly' }];
    storage.save('fh_settings', storage.settings);
    await syncBanks();

    // The client never authors this key; a stale local copy (here, absent
    // entirely) must not erase a queue the server just filled.
    expect(storage.settings.plaidBalanceProposals).toEqual([{ fingerprint: 'f-new', id: 'c1' }]);
    expect(storage.settings.incomes).toHaveLength(2);
  });

  it('reconciles from the offline cache on a page that never loaded the account', async () => {
    await setup();
    serverData = {
      bills: [{ id: 'b1', name: 'Rent', amount: 1500 }, { id: 'b2', name: 'Gas', amount: 40 }],
      transactions: [],
      settings: { incomes: [{ ...BASE_INCOME }] },
    };

    // An edit made here that never reached the server. It is in the cache —
    // which is where pendingSync says unsynced edits live.
    putStatus = 500;
    storage.settings.incomes = [{ ...BASE_INCOME }, { id: 'src-b', label: 'Side', amount: 500, frequency: 'monthly' }];
    storage.save('fh_settings', storage.settings);
    await storage.flushLocalWrites();
    expect(storage.hasUnsyncedEdits()).toBe(true);

    // Now a page that never bootstraps — /settings — imports the module cold
    // and pulls. Its in-memory state is seven empty lists.
    vi.resetModules();
    const cold = await import('../../client/js/storage.svelte.js');
    putStatus = 200;

    const pulled = await cold.pullFromServer();

    expect(pulled).not.toBeNull();
    // The cached paycheck survives rather than being read as a deletion…
    expect(cold.settings.incomes.map((x) => x.id)).toEqual(['src-a', 'src-b']);
    // …and so does everything the server had.
    expect(cold.bills.map((b) => b.id)).toEqual(['b1', 'b2']);
  });

  it('will not read a page with nothing loaded and nothing cached as a mass deletion', async () => {
    await setup();
    serverData = {
      bills: [{ id: 'b1', name: 'Rent', amount: 1500 }],
      transactions: [],
      settings: { incomes: [{ ...BASE_INCOME }] },
    };

    // Re-import fresh and DON'T bootstrap — the state is seven empty lists, the
    // way /settings has it — with nothing in the cache either. A merge would
    // call every record the server has a local delete.
    vi.resetModules();
    ['fh_bills', 'fh_cards', 'fh_payments', 'fh_accounts', 'fh_goals', 'fh_transactions', 'fh_settings']
      .forEach((k) => localStorage.removeItem(k));
    const cold = await import('../../client/js/storage.svelte.js');
    localStorage.setItem('fh_pending_sync', JSON.stringify({ owner: 'a@b.test', at: Date.now() }));

    const pulled = await cold.pullFromServer();

    expect(pulled).not.toBeNull();
    expect(cold.bills.map((b) => b.id)).toEqual(['b1']);
    expect(cold.settings.incomes).toHaveLength(1);
  });

  it('says how far over the size cap a refused write was', async () => {
    await setup();
    putStatus = 413;
    storage.settings.incomes = [{ ...BASE_INCOME }, { id: 'src-b', label: 'Side', amount: 500, frequency: 'monthly' }];
    storage.save('fh_settings', storage.settings);
    await storage.flushLocalWrites();

    // "Too large" is not actionable on its own; the size is what tells the user
    // whether they are a little over or nowhere near.
    expect(storage.rejectedWriteBytes()).toBeGreaterThan(0);
    expect(storage.SYNC_SIZE_LIMIT).toBe(256 * 1024);
    expect(storage.syncBlockedReason()).toBe('rejected');
  });

  it('skips the sync when the dataset is already too large to save', async () => {
    await setup();
    putStatus = 413;
    storage.settings.incomes = [{ ...BASE_INCOME }, { id: 'src-b', label: 'Side', amount: 500, frequency: 'monthly' }];
    storage.save('fh_settings', storage.settings);
    await storage.flushLocalWrites();
    calls.length = 0;

    await syncBanks();

    // Merging a bank's transactions in would only grow a blob that already
    // cannot be written.
    expect(names()).not.toContain('POST /api/plaid/refresh');
    expect(storage.syncBlockedReason()).toBe('rejected');
  });
});
