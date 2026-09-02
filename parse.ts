import { KNOWN_TAGS, type Note } from "./types";

const DATE_RE = /^(\d{4}-\d{2}-\d{2})$/;

// Checkbox / decoration glyphs that show up in the transcript but aren't tags
const DECORATION_RE = /[☒☐✅✓✗🖤❤️♥]/g;

/**
 * A line is a "tag line" if, once decoration glyphs are stripped, its
 * remaining tokens are (almost) entirely recognized destination tags.
 * Unrecognized tokens (e.g. "OR", which isn't a routed destination) are
 * dropped rather than treated as a reason to reject the whole line, since
 * the notebook sometimes has extra shorthand mixed in.
 */
function extractTags(line: string): string[] {
  const cleaned = line.replace(DECORATION_RE, " ").trim();
  if (!cleaned) return [];

  const tokens = cleaned.split(/[,\s]+/).filter(Boolean);
  if (tokens.length === 0) return [];

  const known = tokens.filter((t) => KNOWN_TAGS.has(t));
  const unknown = tokens.length - known.length;

  // Require that this line is *mostly* tags (allow at most one stray token,
  // e.g. "OR") before treating it as a tag line instead of note body text.
  if (known.length > 0 && unknown <= 1) {
    return known;
  }
  return [];
}

/**
 * Parses a transcribed notebook page into individual routed Notes.
 *
 * Expected shape:
 *   YYYY-MM-DD
 *   <note body, possibly multiple lines>
 *   <tag line, e.g. "PW, OR" or "PW R">
 *   <next note body...>
 *   <tag line...>
 */
export function parseTranscript(input: string): Note[] {
  const lines = input
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const notes: Note[] = [];
  let currentDate = "";
  let buffer: string[] = [];

  for (const line of lines) {
    const dateMatch = line.match(DATE_RE);
    if (dateMatch) {
      currentDate = dateMatch[1]!;
      continue;
    }

    const tags = extractTags(line);
    if (tags.length > 0) {
      const text = buffer.join(" ").trim();
      buffer = [];
      if (text) {
        if (!currentDate) {
          throw new Error(
            `Found a tagged note before any date header: "${text}"`,
          );
        }
        notes.push({ date: currentDate, text, tags });
      }
      continue;
    }

    buffer.push(line);
  }

  if (buffer.join(" ").trim().length > 0) {
    console.warn(
      `Transcript ended with un-tagged text, discarding: "${buffer.join(" ").trim()}"`,
    );
  }

  return notes;
}
