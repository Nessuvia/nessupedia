import { describe, expect, it } from "vitest";
import { exportReminderDue } from "@/composables/useExportReminder";
import type { Wiki } from "@/db/types";

const DAY = 24 * 60 * 60 * 1000;
const now = 100 * DAY;
const wiki = (fields: Partial<Wiki>): Wiki => ({ id: "w", name: "Ashfall", themeId: "fandom", voice: "fandom", createdAt: now - 30 * DAY, ...fields });

describe("exportReminderDue", () => {
  it("is due a week after the last export when the wiki changed since", () => {
    expect(exportReminderDue(wiki({ lastExportedAt: now - 7 * DAY }), now - DAY, undefined, now)).toBe(true);
    expect(exportReminderDue(wiki({ lastExportedAt: now - 6 * DAY }), now - DAY, undefined, now)).toBe(false);
  });

  it("stays quiet when nothing changed since the last export", () => {
    expect(exportReminderDue(wiki({ lastExportedAt: now - 20 * DAY }), now - 21 * DAY, undefined, now)).toBe(false);
    expect(exportReminderDue(wiki({}), undefined, undefined, now)).toBe(false);
  });

  it("counts a never-exported wiki from when it was made", () => {
    expect(exportReminderDue(wiki({}), now - DAY, undefined, now)).toBe(true);
    expect(exportReminderDue(wiki({ createdAt: now - 3 * DAY }), now - DAY, undefined, now)).toBe(false);
  });

  it("waits a full week after Later", () => {
    expect(exportReminderDue(wiki({}), now - DAY, now - 6 * DAY, now)).toBe(false);
    expect(exportReminderDue(wiki({}), now - DAY, now - 7 * DAY, now)).toBe(true);
  });
});
