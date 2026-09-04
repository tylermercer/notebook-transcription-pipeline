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

export interface DestinationsConfig {
  pw?: boolean;
  e?: boolean;
  t?: boolean;
  i?: boolean;
  eq?: boolean;
  r?: boolean;
  w?: boolean;
  [key: string]: boolean | undefined;
}

export interface RawConfigFile {
  port?: number;
  notebookPath?: string;
  envPath?: string;
  destinations?: DestinationsConfig;
  pwFolder?: string;
  eFolder?: string;
  [key: string]: any;
}
