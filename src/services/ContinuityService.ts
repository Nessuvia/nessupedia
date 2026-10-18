import type { WikiDatabase } from "@/db/database";
import type { Continuity, Page } from "@/db/types";
import { titleSegments } from "@/markdown/subpages";
import { continuityNameError, findContinuity, versionOf } from "@/markdown/versions";
import { titleKey } from "@/markdown/wikilinks";
import type { PageService } from "./PageService";

export class ContinuityService {
  constructor(
    private readonly db: WikiDatabase,
    private readonly pages: PageService,
  ) {}

  async list(wikiId: string): Promise<Continuity[]> {
    return [...((await this.db.wikis.get(wikiId))?.continuities ?? [])].sort((a, b) => a.name.localeCompare(b.name));
  }

  async get(wikiId: string, name: string): Promise<Continuity | undefined> {
    return findContinuity(await this.list(wikiId), name);
  }

  // Every page's version in a continuity, by title.
  async versions(wikiId: string, name: string): Promise<Page[]> {
    const continuities = await this.list(wikiId);
    const pages = await this.pages.listForWiki(wikiId);
    return pages.filter((page) => titleKey(versionOf(page.title, continuities)?.continuity.name ?? "") === titleKey(name));
  }

  async create(wikiId: string, name: string, description = ""): Promise<Continuity> {
    return this.db.transaction("rw", this.db.wikis, this.db.pages, async () => {
      const trimmed = await this.requireName(wikiId, name);
      const continuity: Continuity = { id: crypto.randomUUID(), name: trimmed, description: description.trim() };
      await this.write(wikiId, (all) => [...all, continuity]);
      return continuity;
    });
  }

  async describe(wikiId: string, id: string, description: string): Promise<void> {
    await this.write(wikiId, (all) => all.map((continuity) => (continuity.id === id ? { ...continuity, description: description.trim() } : continuity)));
  }

  // Renames the continuity, then each of its versions, so links to them follow.
  async rename(wikiId: string, id: string, name: string): Promise<void> {
    await this.db.transaction("rw", [this.db.wikis, this.db.pages, this.db.links, this.db.changes], async () => {
      const current = (await this.list(wikiId)).find((continuity) => continuity.id === id);
      if (!current) throw new Error("That continuity no longer exists");
      const trimmed = await this.requireName(wikiId, name, id);
      if (trimmed === current.name) return;

      const versions = await this.versions(wikiId, current.name);
      await this.write(wikiId, (all) => all.map((continuity) => (continuity.id === id ? { ...continuity, name: trimmed } : continuity)));
      for (const version of versions) await this.pages.rename(version.id, `${titleSegments(version.title)[0]}/${trimmed}`);
    });
  }

  async delete(wikiId: string, id: string): Promise<void> {
    await this.db.transaction("rw", this.db.wikis, this.db.pages, async () => {
      const current = (await this.list(wikiId)).find((continuity) => continuity.id === id);
      if (!current) return;
      const versions = await this.versions(wikiId, current.name);
      if (versions.length > 0) {
        throw new Error(`${current.name} still has ${versions.length} ${versions.length === 1 ? "version" : "versions"}; delete or rename them first`);
      }
      await this.write(wikiId, (all) => all.filter((continuity) => continuity.id !== id));
    });
  }

  // A new name can't clash with another continuity, or with a subpage that would turn into a version.
  private async requireName(wikiId: string, name: string, ownId?: string): Promise<string> {
    const error = continuityNameError(name);
    if (error) throw new Error(error);
    const trimmed = name.trim();
    const clash = findContinuity(await this.list(wikiId), trimmed);
    if (clash && clash.id !== ownId) throw new Error(`A continuity named "${clash.name}" already exists`);
    // Its own versions already carry the name when only the case changes.
    if (clash) return trimmed;

    const key = titleKey(trimmed);
    const named = (await this.pages.listForWiki(wikiId)).filter((page) => titleSegments(page.title).slice(1).some((segment) => titleKey(segment) === key));
    if (named.length > 0) {
      throw new Error(`"${named[0]!.title}" already uses that name for a subpage; rename ${named.length === 1 ? "it" : `it and ${named.length - 1} more`} first`);
    }
    return trimmed;
  }

  private async write(wikiId: string, change: (all: Continuity[]) => Continuity[]): Promise<void> {
    const wiki = await this.db.wikis.get(wikiId);
    if (!wiki) throw new Error(`Wiki ${wikiId} not found`);
    await this.db.wikis.update(wikiId, { continuities: change(wiki.continuities ?? []) });
  }
}
