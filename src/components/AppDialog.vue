<script setup lang="ts">
import { onMounted, useId, useTemplateRef, watch } from "vue";

defineProps<{ title: string }>();
const open = defineModel<boolean>("open", { required: true });

const dialog = useTemplateRef("dialog");
const headingId = useId();

const sync = (isOpen: boolean) => {
  if (isOpen && !dialog.value?.open) dialog.value?.showModal();
  if (!isOpen && dialog.value?.open) dialog.value.close();
};
watch(open, sync, { flush: "post" });
onMounted(() => sync(open.value));

// The dialog element itself only receives clicks on its backdrop, since the content fills it.
function closeOnBackdrop(event: MouseEvent) {
  if (event.target === dialog.value) open.value = false;
}
</script>

<template>
  <dialog ref="dialog" class="app-dialog" :aria-labelledby="headingId" @close="open = false" @click="closeOnBackdrop">
    <div class="dialog-content">
      <h2 :id="headingId">{{ title }}</h2>
      <slot />
    </div>
  </dialog>
</template>

<style scoped>
.app-dialog {
  width: min(32rem, calc(100vw - 2rem));
  padding: 0;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  background: var(--color-surface);
  color: var(--color-text);
  box-shadow: 0 8px 32px rgb(0 0 0 / 25%);
}

.app-dialog::backdrop {
  background: rgb(0 0 0 / 35%);
}

.dialog-content {
  padding: 1.25rem 1.5rem 1.5rem;
}

h2 {
  margin: 0 0 1rem;
  font-size: 1.3rem;
}
</style>
