export type NoteTag = "PW" | "T" | "R" | "I" | "W" | "EQ" | "E";

export const KNOWN_TAGS: ReadonlySet<string> = new Set([
  "PW",
  "T",
  "R",
  "I",
  "W",
  "EQ",
  "E",
]);

export interface Note {
  /** ISO date (YYYY-MM-DD) this note was written under in the notebook */
  date: string;
  /** The note's body text */
  text: string;
  /** Destination tags parsed from the checkbox line, e.g. ["PW", "OR"] */
  tags: string[];
}
