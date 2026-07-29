<!--
  IconMark.svelte — render a category/custom icon (emoji, image, or an
  issuer monogram chip).
-->
<script>
  /** @type {{ info?: { isImage?: boolean, isMonogram?: boolean, text?: string, color?: string, emoji?: string, src?: string } | null, emoji?: string, class?: string, alt?: string }} */
  let { info = null, emoji = '', class: className = '', alt = '' } = $props();

  let isImage = $derived(!!(info && info.isImage && info.src));
  let isMonogram = $derived(!isImage && !!(info && info.isMonogram && info.text));
  let glyph = $derived(
    isImage || isMonogram ? '' : ((info && info.emoji) || emoji || '📌')
  );
</script>

{#if isImage}
  <img class="icon-mark icon-mark-img {className}" src={info.src} alt={alt} />
{:else if isMonogram}
  <span
    class="icon-mark icon-mark-monogram {className}"
    style={info.color ? `background:${info.color};` : ''}
    aria-hidden={alt ? undefined : 'true'}
  >{info.text}</span>
{:else}
  <span class="icon-mark {className}" aria-hidden={alt ? undefined : 'true'}>{glyph}</span>
{/if}
