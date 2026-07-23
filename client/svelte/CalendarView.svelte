<!--
  CalendarView.svelte — month-grid view of upcoming payments.
  Each due day gets a chip per bill / card so the user can see
  clusters (e.g. "ugh, six bills hit between the 15th and 18th")
  at a glance. Month navigation reuses the same offset as the
  Budget tab so the two views stay in sync.
-->
<script>
  import { bills, cards, settings } from '../js/storage.svelte.js';
  import {
    fmt, monthKey, monthLabel, offsetDate,
    paidState, billActive, billDueOn, categoryIconInfo, categoryIconEmoji,
  } from '../js/utils.js';
  import { CARD_ICON } from '../js/categoryIcons.js';
  import { openPayModal } from '../js/modals.js';
  import { getBudgetMonthOffset, setBudgetMonthOffset } from '../js/budget.js';
  import IconMark from './IconMark.svelte';

  let monthOffset = $state(getBudgetMonthOffset());
  $effect(() => { setBudgetMonthOffset(monthOffset); });

  let viewDate  = $derived(offsetDate(monthOffset));
  let mk        = $derived(monthKey(viewDate));
  let monthName = $derived(monthLabel(viewDate));
  let isCurrent = $derived(mk === monthKey());

  let year      = $derived(viewDate.getFullYear());
  let month     = $derived(viewDate.getMonth());
  let daysIn    = $derived(new Date(year, month + 1, 0).getDate());
  let firstDow  = $derived(new Date(year, month, 1).getDay());

  // Index every bill + card by its dueDay so each calendar cell
  // can pull its chips with a single lookup.
  let byDay = $derived.by(() => {
    const map = {};
    bills.forEach((b) => {
      if (!b.dueDay && !b.startDate) return;
      for (let d = 1; d <= daysIn; d++) {
        const occ = new Date(year, month, d);
        if (!billActive(b, occ) || !billDueOn(b, occ)) continue;
        (map[d] = map[d] || []).push({
          type: 'bill',
          refId: String(b.id),
          name: b.name,
          amount: parseFloat(b.amount || 0),
          icon: categoryIconEmoji(b.category, settings),
          iconInfo: categoryIconInfo(b.category, settings),
          autopay: !!b.autopay,
        });
      }
    });
    cards.forEach((c) => {
      if (c.archived) return;
      if (!c.dueDay) return;
      const d = Math.min(parseInt(c.dueDay), daysIn);
      (map[d] = map[d] || []).push({
        type: 'card',
        refId: String(c.id),
        name: c.name + ' (payment)',
        amount: parseFloat(c.minPayment || 0),
        icon: CARD_ICON,
        iconInfo: { isImage: false, emoji: CARD_ICON },
        autopay: !!c.autopay,
      });
    });
    return map;
  });

  // Build the grid as an array of weeks (each week = 7 cells).
  // Padding cells (before day 1 / after the last day) hold null.
  let weeks = $derived.by(() => {
    const cells = [];
    for (let i = 0; i < firstDow; i++) cells.push(null);
    for (let d = 1; d <= daysIn; d++) cells.push(d);
    while (cells.length % 7 !== 0) cells.push(null);
    const out = [];
    for (let i = 0; i < cells.length; i += 7) out.push(cells.slice(i, i + 7));
    return out;
  });

  let today = new Date();
  let todayDay = $derived(
    today.getFullYear() === year && today.getMonth() === month ? today.getDate() : -1
  );

  let totalThisMonth = $derived.by(() => {
    let sum = 0;
    Object.values(byDay).forEach((list) =>
      list.forEach((it) => { sum += it.amount; })
    );
    return sum;
  });

  const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
</script>

<div class="calendar-bar">
  <button class="btn btn-ghost btn-sm" onclick={() => monthOffset--}>‹ Prev</button>
  <div style="text-align:center;">
    <div style="font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);">{isCurrent ? 'This month' : 'Viewing'}</div>
    <div style="font-family:'Manrope',sans-serif;font-size:20px;font-weight:800;letter-spacing:-.03em;">{monthName}</div>
  </div>
  <button class="btn btn-ghost btn-sm" onclick={() => monthOffset++}>Next ›</button>
</div>

<div class="calendar-totals">
  <span><strong>{fmt(totalThisMonth)}</strong> across the month</span>
</div>

<div class="calendar-grid">
  {#each DOW as d}
    <div class="calendar-dow">{d}</div>
  {/each}
  {#each weeks as week, wi (wi)}
    {#each week as day, di (wi + '-' + di)}
      <div class="calendar-cell"
           class:cal-empty={day === null}
           class:cal-today={day === todayDay}>
        {#if day !== null}
          <div class="calendar-day-num">{day}</div>
          {#if byDay[day]}
            {#each byDay[day] as item (item.type + ':' + item.refId)}
              {@const state = paidState(item.type, item.refId, mk)}
              <button class="calendar-chip"
                      class:chip-paid={state === 'full'}
                      class:chip-partial={state === 'partial'}
                      class:chip-card={item.type === 'card'}
                      type="button"
                      onclick={() => openPayModal(item.type, item.refId, item.name, item.amount)}
                      title="{item.name} · {fmt(item.amount)}{item.autopay ? ' · autopay' : ''}{state === 'full' ? ' · paid' : state === 'partial' ? ' · partially paid' : ''}">
                <span class="chip-icon"><IconMark info={item.iconInfo} emoji={item.icon} /></span>
                <span class="chip-name">{item.name}</span>
                <span class="chip-amt">{fmt(item.amount)}</span>
              </button>
            {/each}
          {/if}
        {/if}
      </div>
    {/each}
  {/each}
</div>

<style>
  .calendar-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 14px;
    padding: 14px 16px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 16px;
    margin-bottom: 12px;
  }
  .calendar-totals {
    font-size: 12px;
    color: var(--muted);
    margin-bottom: 10px;
    padding-left: 4px;
  }
  .calendar-grid {
    display: grid;
    grid-template-columns: repeat(7, minmax(0, 1fr));
    gap: 6px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 16px;
    padding: 10px;
  }
  .calendar-dow {
    text-align: center;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: .08em;
    text-transform: uppercase;
    color: var(--muted);
    padding: 4px 0 2px;
  }
  .calendar-cell {
    min-height: 90px;
    border: 1px solid color-mix(in srgb, var(--border) 70%, transparent);
    border-radius: 10px;
    padding: 6px;
    display: flex;
    flex-direction: column;
    gap: 4px;
    background: color-mix(in srgb, var(--bg) 40%, transparent);
  }
  .cal-empty {
    background: transparent;
    border-color: transparent;
  }
  .cal-today {
    border-color: var(--accent);
    box-shadow: inset 0 0 0 1px var(--accent);
  }
  .calendar-day-num {
    font-family: 'Manrope', sans-serif;
    font-size: 12px;
    font-weight: 700;
    color: var(--muted);
    text-align: right;
  }
  .cal-today .calendar-day-num {
    color: var(--accent);
  }
  .calendar-chip {
    display: flex;
    align-items: center;
    gap: 4px;
    background: var(--surface2, var(--surface));
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 3px 5px;
    font-size: 11px;
    cursor: pointer;
    text-align: left;
    color: var(--text);
    overflow: hidden;
  }
  .calendar-chip:hover {
    border-color: var(--accent);
  }
  .chip-card {
    background: color-mix(in srgb, var(--accent) 8%, transparent);
  }
  .chip-paid {
    opacity: 0.55;
    text-decoration: line-through;
  }
  .chip-partial {
    border-color: color-mix(in srgb, var(--orange) 55%, transparent);
    box-shadow: inset 3px 0 0 var(--orange);
  }
  .chip-icon { font-size: 11px; flex-shrink: 0; }
  .chip-name {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .chip-amt {
    font-family: 'Manrope', sans-serif;
    font-weight: 700;
    color: var(--muted);
    flex-shrink: 0;
  }

  @media (max-width: 720px) {
    .calendar-cell {
      min-height: 60px;
      padding: 4px;
    }
    .chip-amt { display: none; }
  }

  @media (max-width: 600px) {
    .calendar-grid {
      padding: 4px;
      gap: 3px;
    }
    /* Day number on its own row, then the per-payment icon dots WRAP
       horizontally below it (instead of a vertical column that overflows). */
    .calendar-cell {
      min-height: 56px;
      padding: 3px;
      flex-flow: row wrap;
      align-content: flex-start;
      justify-content: center;
      gap: 3px;
    }
    .calendar-day-num {
      flex-basis: 100%;
      text-align: center;
      font-size: 10px;
      margin-bottom: 1px;
    }
    .calendar-chip {
      padding: 0;
      justify-content: center;
      align-items: center;
      border-radius: 50%;
      width: 18px;
      height: 18px;
      min-width: 18px;
    }
    .chip-name, .chip-amt {
      display: none;
    }
    .chip-icon {
      font-size: 11px;
      line-height: 1;
      margin: 0;
    }
  }
</style>
