/**
 * extract-text.ts — turn an uploaded resume file into clean, reading-order text.
 *
 * PDFs are the hard case: resumes often use two-column headers (title left,
 * location right) and multiple pages. pdf.js / unpdf's default text join can
 * interleave columns and drop structure, which starves the LLM parser.
 *
 * So for PDFs we extract POSITIONED text items and reconstruct reading order
 * ourselves: group items into lines by their y-coordinate, sort lines top to
 * bottom per page, and order items left to right within a line. This yields
 * text that reads the way a human sees the page — which the LLM parses well.
 *
 * DOCX uses mammoth; plain text passes through.
 */

import mammoth from "mammoth";
import { extractText, extractTextItems, getDocumentProxy } from "unpdf";

export type SupportedKind = "pdf" | "docx" | "text";

export function detectKind(filename: string, mime: string): SupportedKind | null {
  const name = filename.toLowerCase();
  if (mime === "application/pdf" || name.endsWith(".pdf")) return "pdf";
  if (
    mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    name.endsWith(".docx")
  ) {
    return "docx";
  }
  if (mime.startsWith("text/") || name.endsWith(".txt") || name.endsWith(".md")) return "text";
  return null;
}

/* ---------- PDF: positioned-item reconstruction ---------- */

interface PositionedItem {
  text: string;
  x: number;
  y: number;
  width: number;
  page: number;
  hasEOL: boolean;
}

/** unpdf text item shape: { str, x, y, width, height, hasEOL, ... }. */
interface RawTextItem {
  str?: string;
  x?: number;
  y?: number;
  width?: number;
  transform?: number[];
  hasEOL?: boolean;
}

/**
 * Reconstruct page text from positioned items in human reading order.
 * Lines are grouped by y (with tolerance); items within a line are ordered by
 * x. A larger horizontal gap between items becomes a separator so a
 * two-column header ("Title ........ Location") stays on one logical line but
 * keeps a gap, which the LLM reads correctly.
 */
function reconstructFromItems(items: PositionedItem[]): string {
  if (items.length === 0) return "";
  const pages = new Map<number, PositionedItem[]>();
  for (const it of items) {
    if (!pages.has(it.page)) pages.set(it.page, []);
    pages.get(it.page)!.push(it);
  }

  const Y_TOLERANCE = 3; // items within this many units share a line
  const out: string[] = [];

  for (const page of [...pages.keys()].sort((a, b) => a - b)) {
    const pageItems = pages.get(page)!;
    // Group into lines by y (descending: PDF y grows upward).
    const lines: PositionedItem[][] = [];
    const sortedByY = [...pageItems].sort((a, b) => b.y - a.y);
    for (const item of sortedByY) {
      if (!item.text.trim() && !item.hasEOL) continue;
      const line = lines.find((l) => Math.abs(l[0].y - item.y) <= Y_TOLERANCE);
      if (line) line.push(item);
      else lines.push([item]);
    }
    for (const line of lines) {
      line.sort((a, b) => a.x - b.x);
      let text = "";
      let prevEnd = 0;
      for (let i = 0; i < line.length; i++) {
        const it = line[i];
        if (i > 0) {
          // Insert a gap separator for wide horizontal jumps (columns).
          const gap = it.x - prevEnd;
          text += gap > 40 ? "   " : text.endsWith(" ") || it.text.startsWith(" ") ? "" : "";
        }
        text += it.text;
        prevEnd = it.x + it.width;
      }
      const trimmed = text.replace(/[ \t]+/g, " ").trim();
      if (trimmed) out.push(trimmed);
    }
    out.push(""); // page break
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

/** Rough text width estimate fallback when width is missing. */
function estimateWidth(text: string): number {
  return text.length * 6;
}

async function extractPdfText(buffer: ArrayBuffer): Promise<string> {
  const pdf = await getDocumentProxy(new Uint8Array(buffer));

  // 1. Preferred: positioned-item reconstruction (handles columns/pages).
  try {
    const raw = (await extractTextItems(pdf)) as unknown;
    const items = normalizeItems(raw);
    if (items.length > 0) {
      const reconstructed = reconstructFromItems(items);
      if (reconstructed.length >= 40) return reconstructed;
    }
  } catch {
    // fall through to the simple join
  }

  // 2. Fallback: simple merged extraction.
  const { text } = await extractText(pdf, { mergePages: true });
  return (Array.isArray(text) ? text.join("\n") : text).trim();
}

/**
 * Normalize the shapes unpdf may return into a flat list of positioned items
 * with page numbers. unpdf returns `{ totalPages, items }` where `items` is
 * an array of pages, each page an array of `{ str, x, y, width, hasEOL }`.
 */
function normalizeItems(raw: unknown): PositionedItem[] {
  const items: PositionedItem[] = [];

  const pushItem = (it: RawTextItem, page: number) => {
    if (!it.str) return;
    const x = typeof it.x === "number" ? it.x : Array.isArray(it.transform) ? it.transform[4] ?? 0 : 0;
    const y = typeof it.y === "number" ? it.y : Array.isArray(it.transform) ? it.transform[5] ?? 0 : 0;
    const width = typeof it.width === "number" ? it.width : estimateWidth(it.str);
    items.push({ text: it.str, x, y, width, page, hasEOL: Boolean(it.hasEOL) });
  };

  const consume = (value: unknown) => {
    if (!value) return;
    // { totalPages, items: pages[] | items[] }
    if (typeof value === "object" && !Array.isArray(value)) {
      const obj = value as { items?: unknown; pages?: unknown };
      consume(obj.items ?? obj.pages);
      return;
    }
    if (Array.isArray(value)) {
      if (value.length > 0 && Array.isArray(value[0])) {
        // array of pages
        (value as RawTextItem[][]).forEach((pageItems, p) =>
          pageItems.forEach((it) => pushItem(it, p)),
        );
      } else {
        // flat array of items (single page)
        (value as RawTextItem[]).forEach((it) => pushItem(it, 0));
      }
    }
  };

  consume(raw);
  return items;
}

/* ---------- public API ---------- */

export async function extractResumeText(
  buffer: ArrayBuffer,
  kind: SupportedKind,
): Promise<string> {
  switch (kind) {
    case "pdf":
      return extractPdfText(buffer);
    case "docx": {
      const result = await mammoth.extractRawText({ buffer: Buffer.from(buffer) });
      return result.value.trim();
    }
    case "text":
      return new TextDecoder().decode(buffer).trim();
  }
}
