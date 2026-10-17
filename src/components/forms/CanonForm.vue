<script setup lang="ts">
import { ref, watch } from "vue";
import MarkdownEditor from "@/components/MarkdownEditor.vue";
import { CANON_TIERS, canonTier, setCanonTier, TIER_LABELS } from "@/markdown/canon";
import { joinDirective, splitDirective } from "@/markdown/directiveSource";

defineProps<{ wikiId: string }>();
const emit = defineEmits<{ submit: []; cancel: [] }>();
const source = defineModel<string>({ required: true });

const parts = splitDirective(source.value, "canon");
const initialTier = canonTier(/\btier\s*=\s*["']?(\w+)/.exec(parts.open)?.[1]);
const tier = ref(initialTier);
const inner = ref(parts.inner);

// The fence is only rewritten when the tier changes, so an untouched form leaves the source as it was.
watch([tier, inner], () => {
  const open = tier.value === initialTier ? parts.open : setCanonTier(parts.open, tier.value);
  source.value = joinDirective({ ...parts, open, inner: inner.value });
});

const tiers = [...CANON_TIERS].reverse();
</script>

<template>
  <div class="canon-form">
    <fieldset class="tiers">
      <legend>How sure is this?</legend>
      <label v-for="option in tiers" :key="option" :class="['tier', `canon-${option}`, { active: tier === option }]">
        <input v-model="tier" type="radio" name="canon-tier" :value="option" />
        {{ TIER_LABELS[option] }}
      </label>
    </fieldset>
    <MarkdownEditor
      v-model="inner"
      compact
      label="Canon note text"
      :wiki-id="wikiId"
      @submit="emit('submit')"
      @cancel="emit('cancel')"
    />
  </div>
</template>

<style scoped>
.tiers {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
  margin: 0 0 0.75rem;
  padding: 0;
  border: 0;
}

legend {
  float: left;
  margin-right: 0.25rem;
  padding: 0;
  font-weight: 600;
}

.tier {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  padding: 0.2rem 0.7rem;
  border: 1px solid var(--color-border);
  border-radius: 999px;
  cursor: pointer;
}

.tier input {
  margin: 0;
}

.tier.active {
  border-color: var(--tier);
  background: color-mix(in srgb, var(--tier) 12%, transparent);
  font-weight: 600;
}
</style>
