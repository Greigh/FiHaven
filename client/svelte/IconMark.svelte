<!--
  IconMark.svelte — render a category/custom icon (emoji, image, or an
  issuer monogram chip).
-->
<script>
  /** @type {{ info?: { isImage?: boolean, isMonogram?: boolean, text?: string, color?: string, emoji?: string, src?: string, fullColor?: boolean, aspect?: number } | null, emoji?: string, class?: string, alt?: string }} */
  let { info = null, emoji = '', class: className = '', alt = '' } = $props();

  let isImage = $derived(!!(info && info.isImage && info.src));
  let isMonogram = $derived(!isImage && !!(info && info.isMonogram && info.text));
  let glyph = $derived(
    isImage || isMonogram ? '' : ((info && info.emoji) || emoji || '📌')
  );
  // A full-color brand mark keeps its own colors, so it can't ride a
  // brand-tinted chip; it gets a light plate and its natural aspect ratio
  // instead (wordmarks are wider than they are tall).
  let plated = $derived(isImage && !!(info && info.fullColor));
</script>

{#if isImage}
  <img
    class="icon-mark icon-mark-img {plated ? 'icon-mark-plate' : ''} {className}"
    style={plated && info.aspect ? `aspect-ratio:${info.aspect};--logo-aspect:${info.aspect};` : ''}
    src={info.src}
    alt={alt}
  />
{:else if isMonogram}
  <span
    class="icon-mark icon-mark-monogram {className}"
    style={info.color ? `background:${info.color};` : ''}
    aria-hidden={alt ? undefined : 'true'}
  >{info.text}</span>
{:else}
  <span class="icon-mark {className}" aria-hidden={alt ? undefined : 'true'}>{glyph}</span>
{/if}
