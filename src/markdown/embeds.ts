import type { Root } from "mdast";
import type { Plugin } from "unified";
import type { ImageEmbed } from "./nodes";
import { splitTextNodes } from "./textSplit";

const EMBED = /!\[\[([^[\]|]+)(?:\|([^[\]]*))?\]\]/g;
const IMAGE_PATH = /\.(png|jpe?g|gif|webp|avif|svg|bmp)$/i;
const SIZE = /^(\d+)(?:x(\d+))?$/;

export const isImagePath = (path: string) => IMAGE_PATH.test(path.trim());

export function embedMarkdown(path: string): string {
  return `![[${path}]]`;
}

function toEmbed([, rawPath = "", option = ""]: RegExpExecArray): ImageEmbed | undefined {
  const path = rawPath.trim();
  if (!isImagePath(path)) return undefined;
  const size = SIZE.exec(option.trim());
  if (size) return { type: "imageEmbed", path, width: Number(size[1]), ...(size[2] && { height: Number(size[2]) }) };
  return { type: "imageEmbed", path, ...(option.trim() && { alt: option.trim() }) };
}

const remarkEmbeds: Plugin<[], Root> = () => (tree) => splitTextNodes(tree, EMBED, toEmbed);

export default remarkEmbeds;
