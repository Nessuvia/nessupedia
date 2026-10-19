// Character cards as SillyTavern and similar apps write them: V1 is flat JSON, V2 and V3 wrap the fields in
// `data`. PNG cards carry the JSON base64-encoded in tEXt chunks, `chara` for V2 and `ccv3` for V3.

export interface CharacterBook {
  name?: string;
  entries: unknown[];
  [key: string]: unknown;
}

export interface CardData {
  name: string;
  nickname?: string;
  description: string;
  personality: string;
  scenario: string;
  first_mes: string;
  alternate_greetings: string[];
  mes_example: string;
  system_prompt: string;
  post_history_instructions: string;
  creator_notes: string;
  creator: string;
  character_version: string;
  tags: string[];
  character_book?: CharacterBook;
  extensions: Record<string, unknown>;
  [key: string]: unknown;
}

export interface CharacterCard {
  spec: "chara_card_v3";
  spec_version: string;
  data: CardData;
  [key: string]: unknown;
}

const TEXT_FIELDS = [
  "name",
  "description",
  "personality",
  "scenario",
  "first_mes",
  "mes_example",
  "system_prompt",
  "post_history_instructions",
  "creator_notes",
  "creator",
  "character_version",
] as const;

// Fields V2 doesn't have, left out of the `chara` chunk.
const V3_ONLY = ["nickname", "assets", "creator_notes_multilingual", "source", "group_only_greetings", "creation_date", "modification_date"];

const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const strings = (value: unknown) => (Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []);

export function emptyCard(name: string): CharacterCard {
  return normalizeCard({ spec: "chara_card_v3", spec_version: "3.0", data: { name } });
}

// Any card version as V3, with missing fields filled in and everything else kept as it came.
export function normalizeCard(value: unknown): CharacterCard {
  if (!isRecord(value)) throw new Error("This isn't a character card");
  const wrapped = isRecord(value.data) && typeof value.spec === "string";
  const { spec: _spec, spec_version: _version, data: _data, ...outer } = wrapped ? value : ({} as Record<string, unknown>);
  const source = wrapped ? (value.data as Record<string, unknown>) : value;
  if (typeof source.name !== "string") throw new Error("This card has no name");
  // Some apps repeat the fields beside `data` for V1 readers; those copies would go stale as the card is edited.
  for (const key of Object.keys(outer)) if (key in source || (TEXT_FIELDS as readonly string[]).includes(key)) delete outer[key];

  const data = { ...source } as CardData;
  for (const field of TEXT_FIELDS) if (typeof data[field] !== "string") data[field] = "";
  data.alternate_greetings = strings(source.alternate_greetings);
  data.tags = strings(source.tags);
  data.extensions = isRecord(source.extensions) ? source.extensions : {};
  if (!isRecord(source.character_book) || !Array.isArray(source.character_book.entries)) delete data.character_book;
  return { ...outer, spec: "chara_card_v3", spec_version: "3.0", data };
}

export function cardToV2(card: CharacterCard): Record<string, unknown> {
  const data: Record<string, unknown> = { ...card.data };
  for (const field of V3_ONLY) delete data[field];
  return { spec: "chara_card_v2", spec_version: "2.0", data };
}

function isPng(bytes: Uint8Array): boolean {
  return PNG_SIGNATURE.every((byte, index) => bytes[index] === byte);
}

interface Chunk {
  type: string;
  data: Uint8Array;
}

function readChunks(bytes: Uint8Array): Chunk[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const chunks: Chunk[] = [];
  for (let at = 8; at + 12 <= bytes.length; ) {
    const length = view.getUint32(at);
    const type = String.fromCharCode(...bytes.subarray(at + 4, at + 8));
    chunks.push({ type, data: bytes.subarray(at + 8, at + 8 + length) });
    at += 12 + length;
    if (type === "IEND") break;
  }
  return chunks;
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function writeChunk({ type, data }: Chunk): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

function textChunk(keyword: string, text: string): Chunk {
  const data = new Uint8Array(keyword.length + 1 + text.length);
  for (let i = 0; i < keyword.length; i++) data[i] = keyword.charCodeAt(i);
  for (let i = 0; i < text.length; i++) data[keyword.length + 1 + i] = text.charCodeAt(i);
  return { type: "tEXt", data };
}

function readText({ data }: Chunk): [keyword: string, text: string] {
  const split = data.indexOf(0);
  const latin1 = (part: Uint8Array) => Array.from(part, (byte) => String.fromCharCode(byte)).join("");
  return [latin1(data.subarray(0, split)), latin1(data.subarray(split + 1))];
}

const toBase64 = (json: string) => {
  const bytes = new TextEncoder().encode(json);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
};
const fromBase64 = (text: string) => new TextDecoder().decode(Uint8Array.from(atob(text.trim()), (char) => char.charCodeAt(0)));

const CARD_KEYWORDS = new Set(["chara", "ccv3"]);

// The card in a .png or .json file; `png` is set for a PNG, to keep as the card's avatar.
export function readCardFile(bytes: Uint8Array): { card: CharacterCard; png?: Uint8Array } {
  if (!isPng(bytes)) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(new TextDecoder().decode(bytes));
    } catch {
      throw new Error("This file isn't a character card: it's neither a PNG nor JSON");
    }
    return { card: normalizeCard(parsed) };
  }
  const texts = new Map(readChunks(bytes).filter((chunk) => chunk.type === "tEXt").map(readText));
  const encoded = texts.get("ccv3") ?? texts.get("chara");
  if (!encoded) throw new Error("This PNG has no character card in it");
  try {
    return { card: normalizeCard(JSON.parse(fromBase64(encoded))), png: bytes };
  } catch (cause) {
    if (cause instanceof SyntaxError || (cause instanceof DOMException && cause.name === "InvalidCharacterError")) {
      throw new Error("The character card in this PNG is damaged");
    }
    throw cause;
  }
}

// A copy of the PNG with the card written in, replacing any card it already held.
export function writeCardPng(png: Uint8Array, card: CharacterCard): Uint8Array {
  if (!isPng(png)) throw new Error("The avatar isn't a PNG");
  const chunks = readChunks(png).filter((chunk) => !(chunk.type === "tEXt" && CARD_KEYWORDS.has(readText(chunk)[0])));
  const end = chunks.findIndex((chunk) => chunk.type === "IEND");
  chunks.splice(end, 0, textChunk("chara", toBase64(JSON.stringify(cardToV2(card)))), textChunk("ccv3", toBase64(JSON.stringify(card))));
  const parts = chunks.map(writeChunk);
  const out = new Uint8Array(8 + parts.reduce((sum, part) => sum + part.length, 0));
  out.set(PNG_SIGNATURE);
  let at = 8;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

// The text history diffs: the card with its avatar's asset path.
export function cardSource(card: CharacterCard, avatar?: string): string {
  return `${JSON.stringify(avatar ? { avatar, card } : { card }, null, 2)}\n`;
}

export function parseCardSource(source: string): { card: CharacterCard; avatar?: string } {
  const parsed = JSON.parse(source) as { card: unknown; avatar?: string };
  return { card: normalizeCard(parsed.card), ...(parsed.avatar && { avatar: parsed.avatar }) };
}

// What the Assistant reads: the card's text fields, without its lorebook or extensions.
export function cardContextText({ data }: CharacterCard): string {
  const parts: [string, string][] = [
    ["Name", data.nickname ? `${data.name} (${data.nickname})` : data.name],
    ["Description", data.description],
    ["Personality", data.personality],
    ["Scenario", data.scenario],
    ["First message", data.first_mes],
    ...data.alternate_greetings.map((greeting, index): [string, string] => [`Alternate greeting ${index + 1}`, greeting]),
    ["Example dialogue", data.mes_example],
  ];
  return parts
    .filter(([, value]) => value.trim())
    .map(([label, value]) => `${label}:\n${value.trim()}`)
    .join("\n\n");
}
