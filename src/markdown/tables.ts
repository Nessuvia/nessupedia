import { gfmTableFromMarkdown } from "mdast-util-gfm-table";
import { gfmTable } from "micromark-extension-gfm-table";
import type { Processor } from "unified";

// GitHub-style tables, the one part of GFM taken on: the rest (autolinks, footnotes, strikethrough) would
// change how existing pages read.
export default function remarkTables(this: Processor): void {
  const data = this.data();
  (data.micromarkExtensions ??= []).push(gfmTable());
  (data.fromMarkdownExtensions ??= []).push(gfmTableFromMarkdown());
}
