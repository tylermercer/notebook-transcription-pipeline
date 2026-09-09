import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Opens an editor subprocess with initial text written to a temporary file.
 * Waits for the editor process to exit, then reads and returns the edited text.
 *
 * If the resulting file is empty (or whitespace only), or if the editor process fails,
 * throws an error indicating the operation was aborted.
 */
export async function openEditorWithText(
  initialText: string,
  editorCommand: string = "code --wait",
): Promise<string> {
  const tempDir = await mkdtemp(join(tmpdir(), "notebook-transcript-"));
  const tempFilePath = join(tempDir, "TRANSCRIPT.md");

  try {
    await writeFile(tempFilePath, initialText, "utf-8");

    await new Promise<void>((resolve, reject) => {
      const child = spawn(editorCommand, [tempFilePath], {
        shell: true,
        stdio: "inherit",
      });

      child.on("error", (err) => {
        reject(new Error(`Failed to launch editor "${editorCommand}": ${err.message}`));
      });

      child.on("exit", (code, signal) => {
        if (code !== 0) {
          reject(
            new Error(
              `Editor process "${editorCommand}" exited with code ${code ?? signal}. Operation aborted.`,
            ),
          );
        } else {
          resolve();
        }
      });
    });

    const editedContent = await readFile(tempFilePath, "utf-8");
    if (!editedContent.trim()) {
      throw new Error("Transcript is empty. Operation aborted.");
    }

    return editedContent;
  } finally {
    await rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
}
