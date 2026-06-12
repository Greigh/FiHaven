<!--
  SortFilterBar.svelte — reusable sort control + collapsible filter
  sheet, shared by Bills and Cards. `sorts` is [{key,label}]; `filters`
  is [{key,label,type:'toggle'|'select',options?}]. Binds `sort` (a key)
  and `active` (an object of filter values). Multiple filters combine.
-->
<script>
  let { sorts = [], filters = [], sort = $bindable(), active = $bindable({}) } = $props();
  let open = $state(false);

  let activeCount = $derived(
    filters.reduce((n, f) => {
      const v = active[f.key];
      if (f.type === 'toggle') return n + (v ? 1 : 0);
      return n + (v && v !== 'all' ? 1 : 0);
    }, 0)
  );

  function setFilter(key, value) {
    active = { ...active, [key]: value };
  }
  function clearAll() {
    const next = {};
    filters.forEach((f) => { next[f.key] = f.type === 'toggle' ? false : 'all'; });
    active = next;
  }
</script>

<div class="sf-bar">
  <label class="sf-sort">
    <span class="sf-sort-label">Sort</span>
    <select bind:value={sort}>
      {#each sorts as s (s.key)}<option value={s.key}>{s.label}</option>{/each}
    </select>
  </label>
  <div class="sf-bar-actions">
    <button class="btn btn-ghost btn-sm" type="button" onclick={() => (open = !open)}
      aria-expanded={open} title="Filter">
      ⚙ Filters{activeCount ? ` · ${activeCount}` : ''}
    </button>
    {#if activeCount}
      <button class="btn btn-ghost btn-xs" type="button" onclick={clearAll}>Clear</button>
    {/if}
  </div>
</div>

{#if open}
  <div class="sf-panel">
    {#each filters as f (f.key)}
      {#if f.type === 'select'}
        <label class="sf-row sf-row-select">
          <span>{f.label}</span>
          <select value={active[f.key] || 'all'} onchange={(e) => setFilter(f.key, e.currentTarget.value)}>
            {#each f.options as o (o.key)}<option value={o.key}>{o.label}</option>{/each}
          </select>
        </label>
      {:else}
        <label class="sf-row sf-row-toggle">
          <input type="checkbox" checked={!!active[f.key]}
            onchange={(e) => setFilter(f.key, e.currentTarget.checked)} />
          <span>{f.label}</span>
        </label>
      {/if}
    {/each}
  </div>
{/if}
