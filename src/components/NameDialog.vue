<script setup lang="ts">
import { computed, ref, useId, watch } from "vue";
import AppDialog from "./AppDialog.vue";

// Asks for one name. `check` reports a problem as the name is typed; `submit` does the work and may
// throw, and the dialog closes once it succeeds.
const props = defineProps<{
  title: string;
  label: string;
  initial: string;
  action: string;
  check?: (name: string) => string | undefined;
  submit: (name: string) => Promise<void>;
}>();
const open = defineModel<boolean>("open", { required: true });

const id = useId();
const name = ref("");
const busy = ref(false);
const error = ref("");

watch(
  open,
  (isOpen) => {
    if (!isOpen) return;
    name.value = props.initial;
    error.value = "";
  },
  { immediate: true },
);

const problem = computed(() => (name.value.trim() ? props.check?.(name.value) : undefined));
const canSubmit = computed(() => !!name.value.trim() && !problem.value && !busy.value);

async function confirm() {
  if (!canSubmit.value) return;
  busy.value = true;
  error.value = "";
  try {
    await props.submit(name.value.trim());
    open.value = false;
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : String(cause);
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <AppDialog v-model:open="open" :title="title">
    <form @submit.prevent="confirm">
      <label class="label" :for="id">{{ label }}</label>
      <input :id="id" v-model="name" class="text-input" type="text" autocomplete="off" autofocus />
      <p v-if="problem" class="form-error" role="alert">{{ problem }}</p>
      <slot />
      <p v-if="error" class="form-error" role="alert">{{ error }}</p>
      <div class="dialog-actions">
        <button class="button secondary" type="button" @click="open = false">Cancel</button>
        <button class="button" type="submit" :disabled="!canSubmit">{{ action }}</button>
      </div>
    </form>
  </AppDialog>
</template>

<style scoped>
.label {
  display: block;
  margin-bottom: 0.35rem;
  font-weight: 600;
}
</style>
