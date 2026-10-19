<script setup lang="ts">
import { appError } from "@/composables/useAppError";
</script>

<template>
  <div v-if="appError" class="error-toast" role="alert">
    <p>{{ appError }}</p>
    <button type="button" class="button secondary" @click="appError = ''">Dismiss</button>
  </div>
</template>

<style scoped>
.error-toast {
  position: fixed;
  bottom: 1rem;
  left: 50%;
  z-index: 100;
  display: flex;
  align-items: center;
  gap: 1rem;
  width: max-content;
  max-width: calc(100vw - 2rem);
  padding: 0.6rem 0.9rem;
  border-left: 4px solid var(--color-danger);
  border-radius: 4px;
  background: var(--color-surface);
  box-shadow: 0 2px 8px rgb(0 0 0 / 0.25);
  font-size: 0.9rem;
  transform: translateX(-50%);
}

p {
  margin: 0;
}
</style>
