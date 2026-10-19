export interface Field {
  label: string;
  value: string;
}

export interface InfoboxImage {
  path: string;
  caption: string;
}

export interface InfoboxGroup {
  label: string;
  fields: Field[];
}

export interface InfoboxTab {
  label: string;
  images: InfoboxImage[];
  groups: InfoboxGroup[];
}

// The shared tab holds everything before the first `=== Tab` line and shows under every tab.
export interface InfoboxData {
  title: string;
  // Text for the chat button, which shows when the page has a character card.
  chat?: string;
  shared: InfoboxTab;
  tabs: InfoboxTab[];
}

export const PRESSURE_FIELDS = ["Triggers", "Coping", "Contradictions", "Breaking point", "How others read it", "Aftermath"];

const FIELD_LINE = /^([^\s:#=][^:]{0,59}?):(?:[ \t]+(.*))?$/;
const CONTINUATION = /^(?: {2}|\t)/;
const TAB_LINE = /^===[ \t]*(.*)$/;
const GROUP_LINE = /^##(?:[ \t]+(.*))?$/;

interface LineVisitor {
  // Returns true when it consumed the line, which then ends any open field.
  special?: (line: string) => boolean;
  field: (field: Field) => void;
}

function readLines(source: string, visitor: LineVisitor): void {
  let current: Field | undefined;
  let blanks = 0;

  for (const line of source.split(/\r?\n/)) {
    if (!line.trim()) {
      if (current) blanks++;
      continue;
    }
    if (current && CONTINUATION.test(line)) {
      current.value += "\n".repeat(blanks + 1) + line.replace(CONTINUATION, "");
      blanks = 0;
      continue;
    }
    blanks = 0;
    if (visitor.special?.(line)) {
      current = undefined;
      continue;
    }
    const match = FIELD_LINE.exec(line);
    current = match ? { label: match[1]!.trim(), value: match[2]?.trim() ?? "" } : { label: "", value: line.trim() };
    visitor.field(current);
  }
}

function writeField({ label, value }: Field): string {
  const [first = "", ...rest] = value.trim().split("\n");
  const head = label ? (first ? `${label}: ${first}` : `${label}:`) : first;
  return [head, ...rest.map((line) => (line.trim() ? `  ${line}` : ""))].join("\n");
}

export function parseFields(source: string): Field[] {
  const fields: Field[] = [];
  readLines(source, { field: (field) => fields.push(field) });
  return fields;
}

export function serializeFields(fields: Field[]): string {
  return fields
    .filter(({ label, value }) => label.trim() || value.trim())
    .map((field) => writeField({ label: field.label.trim(), value: field.value }))
    .join("\n");
}

export const emptyTab = (label = ""): InfoboxTab => ({ label, images: [], groups: [] });

export function parseInfobox(source: string): InfoboxData {
  const data: InfoboxData = { title: "", shared: emptyTab(), tabs: [] };
  let tab = data.shared;
  let group: InfoboxGroup | undefined;

  readLines(source, {
    special: (line) => {
      const tabMatch = TAB_LINE.exec(line);
      if (tabMatch) {
        tab = emptyTab(tabMatch[1]!.trim());
        data.tabs.push(tab);
        group = undefined;
        return true;
      }
      const groupMatch = GROUP_LINE.exec(line);
      if (groupMatch) {
        group = { label: groupMatch[1]?.trim() ?? "", fields: [] };
        tab.groups.push(group);
        return true;
      }
      const field = FIELD_LINE.exec(line);
      if (field?.[1] === "title") {
        data.title = field[2]?.trim() ?? "";
        return true;
      }
      if (field?.[1] === "chat") {
        data.chat = field[2]?.trim() ?? "";
        return true;
      }
      if (field?.[1] === "image") {
        const [path = "", ...caption] = (field[2] ?? "").split("|");
        if (path.trim()) tab.images.push({ path: path.trim(), caption: caption.join("|").trim() });
        return true;
      }
      return false;
    },
    field: (field) => {
      if (!group) {
        group = { label: "", fields: [] };
        tab.groups.push(group);
      }
      group.fields.push(field);
    },
  });
  return data;
}

function writeTab(tab: InfoboxTab): string[] {
  const lines = tab.images
    .filter(({ path }) => path.trim())
    .map(({ path, caption }) => `image: ${path.trim()}${caption.trim() ? ` | ${caption.trim()}` : ""}`);
  tab.groups.forEach((group, index) => {
    const label = group.label.trim();
    if (label || index > 0) lines.push(label ? `## ${label}` : "##");
    const fields = serializeFields(group.fields);
    if (fields) lines.push(fields);
  });
  return lines;
}

export function serializeInfobox(data: InfoboxData): string {
  const lines = data.title.trim() ? [`title: ${data.title.trim()}`] : [];
  if (data.chat?.trim()) lines.push(`chat: ${data.chat.trim()}`);
  lines.push(...writeTab(data.shared));
  for (const tab of data.tabs) lines.push(`=== ${tab.label.trim() || "Tab"}`, ...writeTab(tab));
  return lines.join("\n");
}
