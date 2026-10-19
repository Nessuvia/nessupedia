<script setup lang="ts">
import type { LinkSuggestion } from "@/db/types";

// The bar above a page while Suggest links is on.
defineProps<{
  suggestions: LinkSuggestion[];
  asking: boolean;
  askedOnce: boolean;
  configured?: boolean;
  error: string;
  note: string;
}>();
defineEmits<{ acceptAll: []; ask: []; cancelAsk: []; done: [] }>();
</script>

<template>
  <section class="link-bar" aria-label="Suggest links" role="region">
    <p class="summary" role="status">
      <template v-if="suggestions.length">
        {{ suggestions.length }} unlinked {{ suggestions.length === 1 ? "mention" : "mentions" }}. Click an underlined phrase to link it.
      </template>
      <template v-else>No unlinked mentions{{ askedOnce ? "" : " of page titles or aliases" }}.</template>
    </p>
    <div class="actions">
      <button v-if="suggestions.length > 1" class="button" type="button" @click="$emit('acceptAll')">Accept all</button>
      <button v-if="asking" class="button secondary" type="button" @click="$emit('cancelAsk')">Stop asking</button>
      <button v-else class="button secondary" type="button" :disabled="configured === false" @click="$emit('ask')">
        Ask the Assistant for more
      </button>
      <button class="button secondary" type="button" @click="$emit('done')">Done</button>
    </div>
    <p v-if="asking" class="muted">The Assistant is reading the page…</p>
    <p v-else-if="note" class="muted">{{ note }}</p>
    <p v-if="configured === false" class="muted">The Assistant needs a model; set one up in settings.</p>
    <p v-if="error" class="form-error" role="alert">{{ error }}</p>
  </section>
</template>

<style scoped>
.link-bar {
  margin: 0 0 1rem;
  padding: 0.75rem 1rem;
  border: 1px solid var(--color-border);
  border-left: 4px solid var(--color-link);
  border-radius: 4px;
  background: var(--color-surface);
}

.summary {
  margin: 0 0 0.5rem;
  font-weight: 600;
}

.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.muted {
  margin: 0.5rem 0 0;
  color: var(--color-muted);
  font-size: 0.9rem;
}
</style>
