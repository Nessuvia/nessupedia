<script setup lang="ts">
import type { Continuity } from "@/db/types";
import { titleParam } from "@/router/params";

// Names the continuity a version belongs to, what changes across it, and what this version changes.
defineProps<{ wikiId: string; continuity: Continuity; mainTitle: string; mainExists: boolean; changes: string[] }>();
</script>

<template>
  <aside class="version-banner" aria-label="Version">
    <p class="lead">
      This is the
      <RouterLink :to="{ name: 'continuity', params: { name: continuity.name } }">{{ continuity.name }}</RouterLink>
      version of
      <RouterLink v-if="mainExists" :to="{ name: 'page', params: { title: titleParam(mainTitle) } }">{{ mainTitle }}</RouterLink>
      <template v-else>{{ mainTitle }}</template>.
    </p>
    <p v-if="continuity.description" class="description">{{ continuity.description }}</p>
    <div v-if="changes.length" class="changes">
      <span>In this version:</span>
      <ul>
        <li v-for="change in changes" :key="change">{{ change }}</li>
      </ul>
    </div>
    <p v-if="!mainExists" class="standalone">{{ mainTitle }} doesn't exist, so this shows only the version's own text.</p>
  </aside>
</template>

<style scoped>
.version-banner {
  margin: 0 0 1rem;
  padding: 0.6rem 0.9rem;
  border-left: 4px solid var(--color-header);
  background: var(--color-page);
  font-size: 0.9rem;
}

p {
  margin: 0;
}

.lead {
  font-weight: 600;
}

.description,
.changes {
  margin-top: 0.35rem;
}

.changes ul {
  margin: 0.15rem 0 0;
  padding-left: 1.25rem;
}

.standalone {
  margin-top: 0.35rem;
  color: var(--color-danger);
}
</style>
