import { describe, expect, it } from "vitest";
import { parseTranscript } from "./parse";

describe("parseTranscript", () => {
  it("parses valid transcript into Note objects", () => {
    const transcript = `
## 2025-06-29
Gratitude is an emotional experience...
☐ PW, ☐ OR
I need to be more patient w/ the flaws of church leaders...
☐ PW
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

  it("handles markdown header prefix ## YYYY-MM-DD and checkbox states", () => {
    const transcript = `
## 2025-06-29
First note text
☑ PW

## 2025-06-30
Second note text
☐ E, ☐ T
`;
    const notes = parseTranscript(transcript);

    expect(notes).toEqual([
      {
        date: "2025-06-30",
        text: "Second note text",
        tags: ["E", "T"],
      },
    ]);
  });

  it("partially processed note line returns only unprocessed tags", () => {
    const transcript = `
## 2025-06-30
42 is the meaning of life
☑ PW, ☐ R
`;
    const notes = parseTranscript(transcript);

    expect(notes).toEqual([
      {
        date: "2025-06-30",
        text: "42 is the meaning of life",
        tags: ["R"],
      },
    ]);
  });

  it("returns empty array if all checkboxes are processed", () => {
    const transcript = `
## 2025-06-29
Completed note
☑ PW, ☑ R
`;
    const notes = parseTranscript(transcript);
    expect(notes).toEqual([]);
  });

  it("throws error when tagged note comes before any date header", () => {
    const transcript = `
Note without date header
☐ PW
`;
    expect(() => parseTranscript(transcript)).toThrow();
  });
});
