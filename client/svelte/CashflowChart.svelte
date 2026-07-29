<!--
  CashflowChart.svelte — income vs. merged spending over time, two lines
  on one axis, oldest → newest.

  Deliberately TWO lines rather than one net line: a single net series
  collapses "earned more" and "spent less" into identical upward movement,
  and those are very different facts about a month. The shaded band between
  the lines carries the net visually; the tooltip carries the number.

  The y-axis IS zero-based here — unusual for a trend line, but the reader's
  job is the GAP between the series, and cropping the axis would inflate that
  gap out of proportion to the money it represents.

  Months we can't account for (card payments with no transactions behind them,
  or no records at all) BREAK the spending line rather than plotting a zero.
  Dashing a line down to the axis still draws a number we don't have; a gap
  plus a shaded column says "no data" and means it.

  Pure presentation: the caller supplies rows from cashflowHistory.js.
-->
<script>
  import { fmt } from '../js/utils.js';

  let { rows = [], height = 210 } = $props();

  const PAD_L = 48, PAD_R = 14, PAD_T = 14, PAD_B = 26;

  let width = $state(560);
  let hoverIdx = $state(-1);

  let plotW = $derived(Math.max(40, width - PAD_L - PAD_R));
  let plotH = $derived(Math.max(40, height - PAD_T - PAD_B));

  // Round the axis ceiling up to a readable step so gridline labels land on
  // round money. The ladder is deliberately fine-grained — a coarse 1/2/5/10
  // jump strands a $7.3k series under a $10k ceiling and wastes a third of
  // the plot height.
  const NICE_STEPS = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10];
  function niceMax(v) {
    if (!(v > 0)) return 1;
    const mag = Math.pow(10, Math.floor(Math.log10(v)));
    const n = v / mag;
    return (NICE_STEPS.find((s) => n <= s + 1e-9) || 10) * mag;
  }

  let maxY = $derived(niceMax(
    Math.max(1, ...rows.map((r) => Math.max(r.income, r.spending))) * 1.05,
  ));

  let xAt = $derived((i) => (rows.length <= 1
    ? PAD_L + plotW / 2
    : PAD_L + (i * plotW) / (rows.length - 1)));
  let yAt = $derived((v) => PAD_T + plotH - (Math.max(0, v) / maxY) * plotH);

  let incomePath = $derived(rows
    .map((r, i) => `${i === 0 ? 'M' : 'L'}${xAt(i).toFixed(1)},${yAt(r.income).toFixed(1)}`)
    .join(' '));

  // Runs of consecutive months whose spending we can actually account for.
  // Blind months are NOT plotted as zero — a dashed line diving to the axis
  // still draws a number we don't have. The line breaks instead, and the gap
  // gets a shaded column so it reads as absent data rather than a glitch.
  let runs = $derived.by(() => {
    const out = [];
    let cur = [];
    rows.forEach((r, i) => {
      if (r.blind) { if (cur.length) out.push(cur); cur = []; }
      else cur.push(i);
    });
    if (cur.length) out.push(cur);
    return out;
  });

  // Income is known for every month (it's projected from settings), so that
  // line stays continuous even where spending is missing.
  let spendPath = $derived(runs
    .filter((run) => run.length > 1)
    .map((run) => run
      .map((i, k) => `${k === 0 ? 'M' : 'L'}${xAt(i).toFixed(1)},${yAt(rows[i].spending).toFixed(1)}`)
      .join(' '))
    .join(' '));

  // A run of one has no segment to draw — mark it with a dot instead.
  let lonePoints = $derived(runs.filter((run) => run.length === 1).map((run) => run[0]));

  // Band between the series, one polygon per run so it never spans a gap.
  let bandPaths = $derived(runs
    .filter((run) => run.length > 1)
    .map((run) => {
      const top = run.map((i, k) => `${k === 0 ? 'M' : 'L'}${xAt(i).toFixed(1)},${yAt(rows[i].income).toFixed(1)}`);
      const bottom = run.slice().reverse()
        .map((i) => `L${xAt(i).toFixed(1)},${yAt(rows[i].spending).toFixed(1)}`);
      return top.join(' ') + ' ' + bottom.join(' ') + ' Z';
    }));

  // Shaded column marking a month with no usable spending figure.
  let blindCols = $derived.by(() => {
    if (!rows.length) return [];
    const half = rows.length > 1 ? (plotW / (rows.length - 1)) / 2 : plotW / 2;
    return rows
      .map((r, i) => (r.blind ? { x: Math.max(PAD_L, xAt(i) - half), w: Math.min(half * 2, plotW) } : null))
      .filter(Boolean);
  });

  let gridLines = $derived([0, 0.25, 0.5, 0.75, 1].map((f) => ({
    y: PAD_T + plotH - f * plotH,
    label: axisLabel(maxY * f),
  })));

  function axisLabel(v) {
    if (v >= 1000) return '$' + (v / 1000).toFixed(v % 1000 === 0 ? 0 : 1) + 'k';
    return '$' + Math.round(v);
  }

  function monthLabel(mk, opts) {
    const [y, m] = mk.split('-').map(Number);
    return new Date(y, m - 1, 1).toLocaleDateString(undefined, opts || { month: 'short' });
  }

  // Thin the x labels to whatever fits: ~70px of breathing room each.
  let labelEvery = $derived(Math.max(1, Math.ceil(rows.length / Math.max(2, Math.floor(plotW / 70)))));

  function onMove(e) {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    if (rows.length <= 1) { hoverIdx = rows.length - 1; return; }
    const i = Math.round(((x - PAD_L) / plotW) * (rows.length - 1));
    hoverIdx = Math.min(rows.length - 1, Math.max(0, i));
  }

  let hovered = $derived(hoverIdx >= 0 && hoverIdx < rows.length ? rows[hoverIdx] : null);
  // Flip the tooltip to the left of the cursor near the right edge.
  let tipLeft = $derived(hovered ? Math.min(Math.max(xAt(hoverIdx), 8), Math.max(8, width - 8)) : 0);
  let tipFlip = $derived(hovered ? xAt(hoverIdx) > width * 0.6 : false);

  let ariaSummary = $derived.by(() => {
    if (!rows.length) return 'No cash-flow data yet.';
    const last = rows[rows.length - 1];
    return `Income versus spending, ${monthLabel(rows[0].mk, { month: 'long', year: 'numeric' })} to `
      + `${monthLabel(last.mk, { month: 'long', year: 'numeric' })}. `
      + `Latest month: income ${fmt(last.income)}, spending `
      + `${last.blind ? 'not recorded' : fmt(last.spending)}. `
      + 'Full figures follow in the table below.';
  });
</script>

<div class="cf-legend">
  <span class="cf-key"><i class="cf-swatch cf-swatch-income"></i>Income</span>
  <span class="cf-key"><i class="cf-swatch cf-swatch-spend"></i>Spending</span>
  {#if rows.some((r) => r.blind)}
    <span class="cf-key cf-key-muted"><i class="cf-swatch cf-swatch-blind"></i>Not recorded</span>
  {/if}
</div>

<div class="cf-wrap" bind:clientWidth={width}>
  <svg
    class="cf-svg"
    {width}
    {height}
    viewBox="0 0 {width} {height}"
    role="img"
    aria-label={ariaSummary}
  >
    <!-- Gridlines sit behind everything and stay recessive. -->
    {#each gridLines as g (g.label + g.y)}
      <line class="cf-grid" x1={PAD_L} y1={g.y} x2={width - PAD_R} y2={g.y} />
      <text class="cf-axis" x={PAD_L - 8} y={g.y + 3.5} text-anchor="end">{g.label}</text>
    {/each}

    {#each blindCols as c, i (i)}
      <rect class="cf-blind-col" x={c.x} y={PAD_T} width={c.w} height={plotH} />
    {/each}

    {#each bandPaths as d, i (i)}
      <path class="cf-band" {d} />
    {/each}

    {#each rows as r, i (r.mk)}
      {#if i % labelEvery === 0 || i === rows.length - 1}
        <text class="cf-axis" x={xAt(i)} y={height - 8} text-anchor="middle">{monthLabel(r.mk)}</text>
      {/if}
    {/each}

    <path class="cf-line cf-line-spend" d={spendPath} />
    <path class="cf-line cf-line-income" d={incomePath} />

    <!-- Months stranded between gaps (and a single-month series) need a dot:
         a path through one point draws nothing. -->
    {#if rows.length === 1}
      <circle class="cf-dot cf-dot-income" cx={xAt(0)} cy={yAt(rows[0].income)} r="4" />
    {/if}
    {#each lonePoints as i (i)}
      <circle class="cf-dot cf-dot-spend" cx={xAt(i)} cy={yAt(rows[i].spending)} r="4" />
    {/each}

    {#if hovered}
      <line class="cf-crosshair" x1={xAt(hoverIdx)} y1={PAD_T} x2={xAt(hoverIdx)} y2={PAD_T + plotH} />
      <circle class="cf-dot cf-dot-income" cx={xAt(hoverIdx)} cy={yAt(hovered.income)} r="4" />
      <!-- No spending dot on a blind month: there is no value to point at. -->
      {#if !hovered.blind}
        <circle class="cf-dot cf-dot-spend" cx={xAt(hoverIdx)} cy={yAt(hovered.spending)} r="4" />
      {/if}
    {/if}

    <rect
      class="cf-hit"
      x={PAD_L} y={PAD_T} width={plotW} height={plotH}
      onmousemove={onMove}
      onmouseleave={() => hoverIdx = -1}
      role="presentation"
    />
  </svg>

  {#if hovered}
    <div class="cf-tip" class:is-flipped={tipFlip} style="left:{tipLeft}px;">
      <div class="cf-tip-head">{monthLabel(hovered.mk, { month: 'long', year: 'numeric' })}</div>
      <div class="cf-tip-row">
        <span><i class="cf-swatch cf-swatch-income"></i>Income</span><span>{fmt(hovered.income)}</span>
      </div>
      <div class="cf-tip-row">
        <span><i class="cf-swatch cf-swatch-spend"></i>Spending</span>
        <span>{hovered.blind ? 'not recorded' : fmt(hovered.spending)}</span>
      </div>
      <div class="cf-tip-row cf-tip-net">
        <span>Net</span>
        <span>{hovered.blind ? '—' : (hovered.net >= 0 ? '+' : '') + fmt(hovered.net)}</span>
      </div>
      {#if hovered.blind}
        <div class="cf-tip-note">
          {#if hovered.cardPaymentsExcluded > 0}
            {fmt(hovered.cardPaymentsExcluded)} in card payments, but no purchases logged — spending is incomplete.
          {:else}
            Nothing recorded this month.
          {/if}
        </div>
      {:else if hovered.cardPaymentsExcluded > 0}
        <div class="cf-tip-note">
          Excludes {fmt(hovered.cardPaymentsExcluded)} in card payments — those settle purchases already counted.
        </div>
      {/if}
    </div>
  {/if}
</div>

<style>
  .cf-legend {
    display: flex;
    flex-wrap: wrap;
    gap: 14px;
    margin-bottom: 6px;
  }
  .cf-key {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    font-weight: 600;
    color: var(--text);
  }
  .cf-key-muted { color: var(--muted); font-weight: 500; }
  .cf-swatch {
    width: 10px;
    height: 10px;
    border-radius: 3px;
    flex: none;
  }
  .cf-swatch-income { background: var(--chart-income); }
  .cf-swatch-spend  { background: var(--chart-spend); }
  .cf-swatch-blind {
    background: color-mix(in srgb, var(--muted) 22%, transparent);
    border: 1px solid color-mix(in srgb, var(--muted) 35%, transparent);
  }

  .cf-wrap { position: relative; width: 100%; }
  .cf-svg { display: block; overflow: visible; }

  .cf-grid { stroke: var(--border); stroke-width: 1; }
  /* Axis text wears text tokens, never a series color. */
  .cf-axis { fill: var(--muted); font-size: 11px; font-family: inherit; }

  .cf-band { fill: color-mix(in srgb, var(--chart-income) 10%, transparent); }
  .cf-blind-col { fill: color-mix(in srgb, var(--muted) 12%, transparent); }

  .cf-line {
    fill: none;
    stroke-width: 2;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .cf-line-income { stroke: var(--chart-income); }
  .cf-line-spend  { stroke: var(--chart-spend); }

  .cf-crosshair { stroke: var(--border); stroke-width: 1; }
  /* 2px surface ring so a dot stays legible where the lines cross. */
  .cf-dot { stroke: var(--surface); stroke-width: 2; }
  .cf-dot-income { fill: var(--chart-income); }
  .cf-dot-spend  { fill: var(--chart-spend); }

  .cf-hit { fill: transparent; }

  .cf-tip {
    position: absolute;
    top: 4px;
    transform: translateX(10px);
    min-width: 190px;
    padding: 9px 11px;
    border: 1px solid var(--border);
    border-radius: 10px;
    background: var(--surface);
    box-shadow: var(--shadow);
    pointer-events: none;
    z-index: 2;
  }
  .cf-tip.is-flipped { transform: translateX(calc(-100% - 10px)); }
  .cf-tip-head {
    font-size: 12px;
    font-weight: 700;
    margin-bottom: 5px;
  }
  .cf-tip-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    font-size: 12px;
    color: var(--muted);
    padding: 2px 0;
  }
  .cf-tip-row span:first-child { display: inline-flex; align-items: center; gap: 6px; }
  .cf-tip-row span:last-child { font-variant-numeric: tabular-nums; color: var(--text); font-weight: 600; }
  .cf-tip-net {
    border-top: 1px solid var(--border);
    margin-top: 4px;
    padding-top: 5px;
  }
  .cf-tip-note {
    margin-top: 6px;
    font-size: 11px;
    line-height: 1.4;
    color: var(--muted);
  }

  @media (max-width: 520px) {
    .cf-tip { min-width: 160px; }
  }
</style>
