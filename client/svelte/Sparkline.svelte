<!--
  Sparkline.svelte — single tiny SVG line chart for the last N
  recorded payment amounts on a bill/card row. Pure presentation;
  the caller passes the values + the dimensions it wants.
-->
<script>
  let { values = [], width = 72, height = 22, color = 'var(--accent)' } = $props();

  // Map values to a polyline path; flatline becomes a centered
  // horizontal stroke so a single point still renders something.
  let path = $derived.by(() => {
    if (!values || values.length === 0) return '';
    if (values.length === 1) {
      const y = height / 2;
      return `M2,${y} L${width - 2},${y}`;
    }
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;
    const step = (width - 4) / (values.length - 1);
    return values
      .map((v, i) => {
        const x = 2 + i * step;
        // Flip Y because SVG origin is top-left.
        const y = height - 2 - ((v - min) / range) * (height - 4);
        return `${i === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`;
      })
      .join(' ');
  });
</script>

{#if values.length > 0}
  <svg width={width} height={height} viewBox="0 0 {width} {height}" style="display:inline-block;vertical-align:middle;">
    <path d={path} fill="none" stroke={color} stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>
{/if}
