<script setup lang="ts">
import { computed } from "vue";
import { diffRows, type DiffRow } from "@/utils/diffRows";

const props = defineProps<{ diff: string; rows?: DiffRow[] }>();

const shown = computed(() => props.rows ?? diffRows(props.diff));
const MARKS = { context: " ", removed: "−", added: "+" } as const;
</script>

<template>
  <table v-if="shown.length" class="diff">
    <tbody>
      <template v-for="(row, index) in shown" :key="index">
        <tr v-if="row.kind === 'gap'" class="gap">
          <td colspan="4">Line {{ row.newStart || row.oldStart || 1 }}</td>
        </tr>
        <tr v-else :class="row.kind">
          <td class="number">{{ row.oldLine }}</td>
          <td class="number">{{ row.newLine }}</td>
          <td class="mark" :aria-label="row.kind === 'context' ? undefined : row.kind">{{ MARKS[row.kind] }}</td>
          <td class="text"><template v-for="(part, partIndex) in row.parts" :key="partIndex"><mark v-if="part.changed">{{ part.text }}</mark><template v-else>{{ part.text }}</template></template></td>
        </tr>
      </template>
    </tbody>
  </table>
  <p v-else class="no-diff">No text changed.</p>
</template>

<style scoped>
.diff {
  width: 100%;
  border-collapse: collapse;
  border: 1px solid var(--color-border);
  font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
  font-size: 0.8rem;
  line-height: 1.5;
}

td {
  padding: 0 0.4rem;
  vertical-align: top;
}

.number {
  width: 1%;
  color: var(--color-muted);
  text-align: right;
  user-select: none;
  white-space: nowrap;
}

.mark {
  width: 1%;
  user-select: none;
}

.text {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.gap td {
  padding: 0.15rem 0.6rem;
  background: var(--color-page);
  color: var(--color-muted);
  font-family: system-ui, sans-serif;
}

.removed {
  background: var(--color-diff-removed);
}

.added {
  background: var(--color-diff-added);
}

.removed mark {
  background: var(--color-diff-removed-word);
  color: inherit;
}

.added mark {
  background: var(--color-diff-added-word);
  color: inherit;
}

.no-diff {
  margin: 0;
  color: var(--color-muted);
}
</style>
