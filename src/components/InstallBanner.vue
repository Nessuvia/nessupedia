<script setup lang="ts">
import { useInstallPrompt } from "@/composables/useInstallPrompt";

const { mode, install, dismiss } = useInstallPrompt();
</script>

<template>
  <aside v-if="mode" class="install-banner" aria-label="Install the app">
    <p v-if="mode === 'button'">Install OC Wiki to open it like an app, even offline.</p>
    <p v-else>Add OC Wiki to your home screen to open it like an app: tap Share, then Add to Home Screen.</p>
    <div class="actions">
      <button v-if="mode === 'button'" type="button" class="button" @click="install">Install</button>
      <button type="button" class="button secondary" @click="dismiss">Not now</button>
    </div>
  </aside>
</template>

<style scoped>
.install-banner {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem 1rem;
  margin: 0 0 1rem;
  padding: 0.6rem 0.9rem;
  border-left: 4px solid var(--color-header);
  background: var(--color-surface);
  font-size: 0.9rem;
}

p {
  margin: 0;
}

.actions {
  display: flex;
  gap: 0.5rem;
  margin-left: auto;
}
</style>
