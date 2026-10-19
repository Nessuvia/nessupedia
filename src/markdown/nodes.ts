import type { BlockContent, Node, Parent, PhrasingContent } from "mdast";
import type { CanonTier } from "@/db/types";

export interface CanonBlock extends Parent {
  type: "canonBlock";
  tier: CanonTier;
  children: BlockContent[];
}

export interface CanonInline extends Parent {
  type: "canonInline";
  tier: CanonTier;
  children: PhrasingContent[];
}

// A field's children are phrasing for one-paragraph values and blocks otherwise.
export interface FieldNode extends Parent {
  type: "field";
  label: string;
  children: (BlockContent | PhrasingContent)[];
}

export interface FieldGroupNode extends Parent {
  type: "fieldGroup";
  label: string;
  children: FieldNode[];
}

export interface InfoboxTabNode extends Parent {
  type: "infoboxTab";
  label: string;
  images: { path: string; caption: string }[];
  children: FieldGroupNode[];
}

export interface InfoboxNode extends Parent {
  type: "infobox";
  title: string;
  chat?: string;
  children: InfoboxTabNode[];
}

export interface PressureNode extends Parent {
  type: "pressure";
  children: FieldNode[];
}

export interface CalloutTitle extends Parent {
  type: "calloutTitle";
  children: PhrasingContent[];
}

export interface Callout extends Parent {
  type: "callout";
  calloutType: string;
  fold: "" | "+" | "-";
  children: [CalloutTitle, ...BlockContent[]];
}

export interface ImageEmbed extends Node {
  type: "imageEmbed";
  path: string;
  alt?: string;
  width?: number;
  height?: number;
}

// A stretch of text marked while rendering, such as a suggested link; never parsed from markdown.
export interface TextMark extends Node {
  type: "textMark";
  id: number;
  value: string;
}

declare module "mdast" {
  interface BlockContentMap {
    canonBlock: CanonBlock;
    infobox: InfoboxNode;
    pressure: PressureNode;
    callout: Callout;
  }
  interface PhrasingContentMap {
    canonInline: CanonInline;
    imageEmbed: ImageEmbed;
    textMark: TextMark;
  }
  interface RootContentMap {
    textMark: TextMark;
    canonBlock: CanonBlock;
    canonInline: CanonInline;
    infobox: InfoboxNode;
    infoboxTab: InfoboxTabNode;
    fieldGroup: FieldGroupNode;
    field: FieldNode;
    pressure: PressureNode;
    callout: Callout;
    calloutTitle: CalloutTitle;
    imageEmbed: ImageEmbed;
  }
}
