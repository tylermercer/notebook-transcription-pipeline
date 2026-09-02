import { describe, expect, it } from "vitest";
import { parseTranscript } from "./parse";

describe("parseTranscript", () => {
  it("parses valid transcript into Note objects", () => {
    const transcript = `
2025-06-29
Gratitude is an emotional experience...
PW, OR
I need to be more patient w/ the flaws of church leaders...
PW
`;
    const notes = parseTranscript(transcript);

    expect(notes).toEqual([
      {
        date: "2025-06-29",
        text: "Gratitude is an emotional experience...",
        tags: ["PW"],
      },
      {
        date: "2025-06-29",
        text: "I need to be more patient w/ the flaws of church leaders...",
        tags: ["PW"],
      },
    ]);
  });

  it("handles multiple dates and decoration glyphs in tag lines", () => {
    const transcript = `
2025-06-29
First note text
☑ PW ✅

2025-06-30
Second note text across
multiple lines
E, T
`;
    const notes = parseTranscript(transcript);

    expect(notes).toEqual([
      {
        date: "2025-06-29",
        text: "First note text",
        tags: ["PW"],
      },
      {
        date: "2025-06-30",
        text: "Second note text across multiple lines",
        tags: ["E", "T"],
      },
    ]);
  });

  it("throws error when tagged note comes before any date header", () => {
    const transcript = `
Note without date header
PW
`;
    expect(() => parseTranscript(transcript)).toThrow(
      'Found a tagged note before any date header: "Note without date header"',
    );
  });

  it("discards un-tagged trailing text with a warning", () => {
    const transcript = `
2025-06-29
Valid note
PW
Trailing note without tags
`;
    const notes = parseTranscript(transcript);
    expect(notes).toHaveLength(1);
    expect(notes[0]?.text).toBe("Valid note");
  });
});
