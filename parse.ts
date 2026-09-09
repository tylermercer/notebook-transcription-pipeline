import { KNOWN_TAGS, type Note } from "./types";

const DATE_RE = /^(?:##\s*)?(\d{4}-\d{2}-\d{2})$/;

// Checkbox pattern for tag lines: e.g. [ ] PW or [x] PW
const TAG_ITEM_RE = /(\[[ xX]\])\s*\b([A-Za-z]+)\b/g;

export interface ParsedTagItem {
  tag: string;
  processed: boolean;
  rawToken: string;
}

/**
 * Extracts tag items from a line. Returns empty array if not a tag line.
 */
export function extractTagItems(line: string): ParsedTagItem[] {
  const matches = Array.from(line.matchAll(TAG_ITEM_RE));
  if (matches.length === 0) return [];

  const items: ParsedTagItem[] = [];
  let unknownCount = 0;

  for (const match of matches) {
    const checkbox = match[1] || "";
    const rawTag = match[2] || "";
    const isProcessed =
      checkbox.includes("x") || checkbox.includes("X");

    if (KNOWN_TAGS.has(rawTag)) {
      items.push({
        tag: rawTag,
        processed: isProcessed,
        rawToken: match[0],
      });
    } else if (rawTag) {
      unknownCount++;
    }
  }

  if (items.length > 0 && unknownCount <= 1) {
    return items;
  }
  return [];
}

/**
 * Parses a transcribed notebook document into individual routed Notes,
 * starting from the date section of the first unprocessed task.
 */
export function parseTranscript(input: string): Note[] {
  const lines = input.split("\n");

  // Find the first line with an unprocessed tag
  let firstUnprocessedLineIndex = -1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!.trim();
    if (!line) continue;
    const items = extractTagItems(line);
    if (items.some((item) => !item.processed)) {
      firstUnprocessedLineIndex = i;
      break;
    }
  }

  if (firstUnprocessedLineIndex === -1) {
    return [];
  }

  // Find the date header preceding or at firstUnprocessedLineIndex
  let startDateHeaderIndex = -1;
  for (let i = firstUnprocessedLineIndex; i >= 0; i--) {
    const line = lines[i]!.trim();
    if (DATE_RE.test(line)) {
      startDateHeaderIndex = i;
      break;
    }
  }

  if (startDateHeaderIndex === -1) {
    throw new Error(
      `Found an unprocessed tagged note before any date header`,
    );
  }

  const notes: Note[] = [];
  let currentDate = "";
  let buffer: string[] = [];

  for (let i = startDateHeaderIndex; i < lines.length; i++) {
    const line = lines[i]!.trim();
    if (!line) continue;

    const dateMatch = line.match(DATE_RE);
    if (dateMatch) {
      if (buffer.length > 0) {
        console.warn(
          `Discarding un-tagged text before new date header: "${buffer.join(" ").trim()}"`,
        );
        buffer = [];
      }
      currentDate = dateMatch[1]!;
      continue;
    }

    const tagItems = extractTagItems(line);
    if (tagItems.length > 0) {
      const text = buffer.join(" ").trim();
      buffer = [];

      const unprocessedTags =
        i >= firstUnprocessedLineIndex
          ? tagItems.filter((item) => !item.processed).map((item) => item.tag)
          : [];

      if (unprocessedTags.length > 0) {
        if (!text) {
          continue;
        }
        if (!currentDate) {
          throw new Error(
            `Found a tagged note before any date header: "${text}"`,
          );
        }
        notes.push({ date: currentDate, text, tags: unprocessedTags });
      }
      continue;
    }

    buffer.push(line);
  }

  if (buffer.length > 0) {
    console.warn(
      `Transcript ended with un-tagged text, discarding: "${buffer.join(" ").trim()}"`,
    );
  }

  return notes;
}
