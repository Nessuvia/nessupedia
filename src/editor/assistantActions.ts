// Lets editors offer the page's Assistant actions in the slash menu. The page view registers a handler while it's
// shown; editors elsewhere, such as the split view, find none and leave the actions out.
export type SlashAssistantAction = "draft" | "fill";

let handler: ((action: SlashAssistantAction) => void) | undefined;

export function handleAssistantActions(next: ((action: SlashAssistantAction) => void) | undefined): void {
  handler = next;
}

export function assistantActionHandler(): ((action: SlashAssistantAction) => void) | undefined {
  return handler;
}
