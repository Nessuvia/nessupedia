<script setup lang="ts">
import { ref, useId, useTemplateRef } from "vue";
import { useDismiss } from "@/composables/useDismiss";

export type AssistantAction = "draft" | "fill" | "links";

// The page's Assistant actions, kept in one menu so the page actions stay short.
defineProps<{ actions: { action: AssistantAction; label: string }[] }>();
const emit = defineEmits<{ choose: [action: AssistantAction] }>();

const open = ref(false);
const menuId = useId();
useDismiss(open, useTemplateRef("root"));

function choose(action: AssistantAction) {
  open.value = false;
  emit("choose", action);
}
</script>

<template>
  <div ref="root" class="assistant-menu">
    <button class="page-action" type="button" :aria-expanded="open" :aria-controls="menuId" @click="open = !open">
      Assistant <span aria-hidden="true">▾</span>
    </button>
    <ul v-if="open" :id="menuId" class="menu">
      <li v-for="item in actions" :key="item.action">
        <button type="button" @click="choose(item.action)">{{ item.label }}</button>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.assistant-menu {
  position: relative;
}

.page-action {
  padding: 0;
  border: 0;
  background: none;
  color: var(--color-link);
  font: inherit;
  font-size: 0.8rem;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  cursor: pointer;
}

.menu {
  position: absolute;
  top: 100%;
  right: 0;
  z-index: 10;
  min-width: 12rem;
  margin: 0.25rem 0 0;
  padding: 0.25rem 0;
  border: 1px solid var(--color-border);
  border-radius: 4px;
  background: var(--color-surface);
  box-shadow: 0 4px 12px rgb(0 0 0 / 12%);
  list-style: none;
}

.menu button {
  display: block;
  width: 100%;
  padding: 0.4rem 0.9rem;
  border: 0;
  background: none;
  color: var(--color-text);
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.menu button:hover {
  background: var(--color-page);
}
</style>
