import { describe, expect, it } from "vitest";
import { openEditorWithText } from "./editor";

describe("openEditorWithText", () => {
  it("opens editor, reads modified content, and cleans up temp files", async () => {
    // Node command that appends a line to the file
    const mockEditor = `node -e "require('node:fs').appendFileSync(process.argv[1], '\\nModified by user')"` ;
    const initialText = "## 2025-06-29\nOriginal transcript";

    const result = await openEditorWithText(initialText, mockEditor);
    expect(result).toBe("## 2025-06-29\nOriginal transcript\nModified by user");
  });

  it("throws error and aborts if file is saved as empty", async () => {
    // Node command that overwrites file with empty string
    const mockEditor = `node -e "require('node:fs').writeFileSync(process.argv[1], '')"`;
    const initialText = "Initial transcript";

    await expect(openEditorWithText(initialText, mockEditor)).rejects.toThrow(
      "Transcript is empty. Operation aborted.",
    );
  });

  it("throws error if editor process exits with non-zero exit code", async () => {
    const mockEditor = `node -e "process.exit(1)"`;
    const initialText = "Initial transcript";

    await expect(openEditorWithText(initialText, mockEditor)).rejects.toThrow(
      /exited with code 1/,
    );
  });
});
