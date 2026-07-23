<!--
  IconMark.svelte — render a category/custom icon (emoji or image).
-->
<script>
  /** @type {{ info?: { isImage?: boolean, emoji?: string, src?: string } | null, emoji?: string, class?: string, alt?: string }} */
  let { info = null, emoji = '', class: className = '', alt = '' } = $props();

  let isImage = $derived(!!(info && info.isImage && info.src));
  let glyph = $derived(
    isImage ? '' : ((info && info.emoji) || emoji || '📌')
  );
</script>

{#if isImage}
  <img class="icon-mark icon-mark-img {className}" src={info.src} alt={alt} />
{:else}
  <span class="icon-mark {className}" aria-hidden={alt ? undefined : 'true'}>{glyph}</span>
{/if}
