<script setup lang="ts">
import { storeToRefs } from "pinia";
import { watchEffect } from "vue";
import { useLiveQuery } from "@/composables/useLiveQuery";
import { categoryService } from "@/services";
import { useWikiStore } from "@/stores/wiki";

const props = defineProps<{ wikiId: string }>();

const { currentWiki } = storeToRefs(useWikiStore());
const categories = useLiveQuery((wikiId) => categoryService.list(wikiId), () => props.wikiId);

watchEffect(() => {
  document.title = ["Categories", currentWiki.value?.name].filter(Boolean).join(" | ");
});
</script>

<template>
  <article class="content-card">
    <h1>Categories</h1>
    <p v-if="categories?.length === 0" class="empty">
      No categories yet. Add some to a page's <code>categories</code> to group it with others.
    </p>
    <ul v-else-if="categories">
      <li v-for="category in categories" :key="category.key">
        <RouterLink :to="{ name: 'category', params: { name: category.name } }">{{ category.name }}</RouterLink>
        <span class="count">({{ category.count }})</span>
      </li>
    </ul>
  </article>
</template>

<style scoped>
ul {
  columns: 14rem;
  margin: 0;
  padding: 0;
  list-style: none;
}

li {
  padding: 0.15rem 0;
  break-inside: avoid;
}

.count,
.empty {
  color: var(--color-muted);
}

.count {
  margin-left: 0.3rem;
  font-size: 0.85rem;
}
</style>
