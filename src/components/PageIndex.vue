<script setup lang="ts">
import { computed } from "vue";
import type { Page } from "@/db/types";
import { titleParam } from "@/router/params";

const props = defineProps<{ wikiId: string; pages: Page[] }>();

const groups = computed(() => {
  const byLetter = new Map<string, Page[]>();
  for (const page of props.pages) {
    const first = page.title.charAt(0).toLocaleUpperCase();
    const letter = /\p{L}/u.test(first) ? first : "#";
    byLetter.set(letter, [...(byLetter.get(letter) ?? []), page]);
  }
  return [...byLetter];
});
</script>

<template>
  <section v-for="[letter, group] in groups" :key="letter" :aria-labelledby="`letter-${letter}`">
    <h2 :id="`letter-${letter}`">{{ letter }}</h2>
    <ul>
      <li v-for="page in group" :key="page.id">
        <RouterLink :to="{ name: 'page', params: { title: titleParam(page.title) } }">{{ page.title }}</RouterLink>
      </li>
    </ul>
  </section>
</template>

<style scoped>
h2 {
  font-size: 1.2rem;
}

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
</style>
