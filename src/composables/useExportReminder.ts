import { computed, type Ref } from "vue";
import { db } from "@/db/database";
import type { Wiki } from "@/db/types";
import { useLiveQuery } from "./useLiveQuery";
import { useStoredRef } from "./useStoredRef";

export const EXPORT_REMINDER_DAYS = 7;
const INTERVAL = EXPORT_REMINDER_DAYS * 24 * 60 * 60 * 1000;

// Overdue once a wiki changed since its last export (or since it was made) and that export is a week old.
export function exportOverdue(wiki: Wiki, lastChangeAt: number | undefined, now = Date.now()): boolean {
  return lastChangeAt !== undefined && lastChangeAt > (wiki.lastExportedAt ?? 0) && now - (wiki.lastExportedAt ?? wiki.createdAt) >= INTERVAL;
}

// The banner shows for an overdue wiki unless Later was clicked within the last week.
export function exportReminderDue(wiki: Wiki, lastChangeAt: number | undefined, snoozedAt: number | undefined, now = Date.now()): boolean {
  return exportOverdue(wiki, lastChangeAt, now) && now - (snoozedAt ?? 0) >= INTERVAL;
}

export function useExportReminder(wiki: Readonly<Ref<Wiki | undefined>>) {
  const snoozed = useStoredRef<Record<string, number>>("oc-wiki:export-snoozed", {});
  const lastChange = useLiveQuery(
    (wikiId) => (wikiId ? db.changes.where("wikiId").equals(wikiId).last() : undefined),
    () => wiki.value?.id,
  );
  const overdue = computed(() => !!wiki.value && exportOverdue(wiki.value, lastChange.value?.at));
  const due = computed(() => !!wiki.value && exportReminderDue(wiki.value, lastChange.value?.at, snoozed.value[wiki.value.id]));

  return {
    overdue,
    due,
    later: () => {
      if (wiki.value) snoozed.value = { ...snoozed.value, [wiki.value.id]: Date.now() };
    },
  };
}
