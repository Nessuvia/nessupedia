import type { Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { embedMarkdown } from "@/markdown/embeds";
import { assetService } from "@/services";
import { isSupportedImage } from "@/services/AssetService";

export interface ImageInsertOptions {
  wikiId: () => string;
  onStatus: (message: string) => void;
}

const imageFiles = (data: DataTransfer | null): File[] => [...(data?.files ?? [])].filter(isSupportedImage);

// Stores the files as assets, then inserts one embed per line where they were pasted or dropped.
export async function insertImages(view: EditorView, files: File[], at: number, { wikiId, onStatus }: ImageInsertOptions): Promise<void> {
  onStatus(files.length === 1 ? "Adding image…" : `Adding ${files.length} images…`);
  try {
    const embeds: string[] = [];
    for (const file of files) embeds.push(embedMarkdown((await assetService.addImage(wikiId(), file, file.name)).path));
    const from = Math.min(at, view.state.doc.length);
    const insert = embeds.join("\n");
    view.dispatch({ changes: { from, insert }, selection: { anchor: from + insert.length }, scrollIntoView: true });
    onStatus("");
  } catch (cause) {
    onStatus(cause instanceof Error ? cause.message : String(cause));
  }
}

export function imagePasteAndDrop(options: ImageInsertOptions): Extension {
  return EditorView.domEventHandlers({
    paste(event, view) {
      const files = imageFiles(event.clipboardData);
      if (files.length === 0) return false;
      event.preventDefault();
      void insertImages(view, files, view.state.selection.main.head, options);
      return true;
    },
    drop(event, view) {
      const files = imageFiles(event.dataTransfer);
      if (files.length === 0) return false;
      event.preventDefault();
      const at = view.posAtCoords({ x: event.clientX, y: event.clientY }) ?? view.state.selection.main.head;
      void insertImages(view, files, at, options);
      return true;
    },
  });
}
