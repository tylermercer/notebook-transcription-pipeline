import { describe, expect, it } from "vitest";
import { checkOffTagInContent } from "./runner";

describe("checkOffTagInContent", () => {
  it("replaces first unprocessed tag with checked tag", () => {
    const input = `
## 2025-06-29
Note text
☐ PW, ☐ R
`;
    const result = checkOffTagInContent(input, "PW");
    expect(result).toBe(`
## 2025-06-29
Note text
☑ PW, ☐ R
`);
  });

  it("leaves already checked tags alone and targets first unchecked tag", () => {
    const input = `
## 2025-06-29
Note text
☑ PW, ☐ R
`;
    const result = checkOffTagInContent(input, "R");
    expect(result).toBe(`
## 2025-06-29
Note text
☑ PW, ☑ R
`);
  });

  it("handles tags without space after checkbox e.g. ☐PW", () => {
    const input = `
## 2025-06-29
Note text
☐PW, ☐R
`;
    const result = checkOffTagInContent(input, "PW");
    expect(result).toBe(`
## 2025-06-29
Note text
☑ PW, ☐R
`);
  });
});
