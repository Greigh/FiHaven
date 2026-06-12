<!--
  GoalsPanel.svelte — savings goals on the Budget tab. Each goal has a
  target, an amount saved, and an optional target date that drives a
  suggested monthly contribution. Edited inline like income sources.
-->
<script>
  import { goals, save } from '../js/storage.svelte.js';
  import { fmt, monthsUntil } from '../js/utils.js';

  function persist() { save('fh_goals', goals); }
  function addGoal() {
    goals.push({
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      name: '', target: 0, saved: 0, targetDate: '', notes: '',
    });
    persist();
  }
  function updateGoal(i, patch) { Object.assign(goals[i], patch); persist(); }
  function removeGoal(i) { goals.splice(i, 1); persist(); }

  const pct = (g) => {
    const t = parseFloat(g.target) || 0;
    return t > 0 ? Math.min(100, Math.round(((parseFloat(g.saved) || 0) / t) * 100)) : 0;
  };
  function suggested(g) {
    const remaining = Math.max(0, (parseFloat(g.target) || 0) - (parseFloat(g.saved) || 0));
    if (!g.targetDate || remaining <= 0) return null;
    const m = Math.max(1, monthsUntil(g.targetDate));
    return remaining / m;
  }
</script>

<section class="budget-card">
  <header class="budget-card-head">
    <div>
      <div class="budget-card-kicker">Savings goals</div>
      <h3 class="budget-card-title">What you're saving toward</h3>
      <p class="budget-card-sub">Set a target and a date — we'll suggest how much to set aside each month. Update "Saved" as you go.</p>
    </div>
    <button class="btn btn-primary btn-sm" onclick={addGoal}>+ Add goal</button>
  </header>

  {#if goals.length === 0}
    <div class="budget-income-empty"><p>No goals yet — add an emergency fund, a trip, or a big purchase.</p></div>
  {:else}
    <div class="goals-list">
      {#each goals as g, i (g.id)}
        {@const sug = suggested(g)}
        <div class="goal-card">
          <div class="goal-row-top">
            <input class="goal-name" type="text" placeholder="Goal name (e.g. Emergency fund)"
              value={g.name} oninput={(e) => updateGoal(i, { name: e.currentTarget.value })} />
            <button class="budget-income-remove" type="button" aria-label="Remove goal"
              onclick={() => removeGoal(i)}>×</button>
          </div>
          <div class="goal-bar"><div class="goal-bar-fill" style="width:{pct(g)}%;"></div></div>
          <div class="goal-fields">
            <label class="goal-field">
              <span>Saved</span>
              <div class="goal-amount"><span>$</span>
                <input type="number" step="50" placeholder="0" value={g.saved || ''}
                  oninput={(e) => updateGoal(i, { saved: parseFloat(e.currentTarget.value) || 0 })} />
              </div>
            </label>
            <label class="goal-field">
              <span>Target</span>
              <div class="goal-amount"><span>$</span>
                <input type="number" step="100" placeholder="0" value={g.target || ''}
                  oninput={(e) => updateGoal(i, { target: parseFloat(e.currentTarget.value) || 0 })} />
              </div>
            </label>
            <label class="goal-field">
              <span>Target date</span>
              <input type="date" value={g.targetDate || ''}
                onchange={(e) => updateGoal(i, { targetDate: e.currentTarget.value })} />
            </label>
          </div>
          <div class="goal-meta">
            <span>{pct(g)}% · {fmt(parseFloat(g.saved) || 0)} of {fmt(parseFloat(g.target) || 0)}</span>
            {#if sug !== null}<span class="goal-suggest">Save {fmt(sug)}/mo to hit it</span>{/if}
          </div>
        </div>
      {/each}
    </div>
  {/if}
</section>
