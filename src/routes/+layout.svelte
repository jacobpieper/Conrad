<script lang="ts">
  let { children } = $props()
</script>

{@render children()}

<style>
  :global(html, body) {
    margin: 0;
    height: 100%;
    background: #101010;
  }
</style>
