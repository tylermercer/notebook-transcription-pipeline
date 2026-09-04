import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";

export async function readNotebookTail(filePath: string, lineCount = 10): Promise<string> {
  if (!existsSync(filePath)) {
    return "";
  }
  const content = await readFile(filePath, "utf-8");
  const lines = content.split("\n");
  // Trim trailing empty line if text ends with newline
  if (lines.length > 0 && lines[lines.length - 1] === "") {
    lines.pop();
  }
  const lastLines = lines.slice(-lineCount);
  return lastLines.join("\n");
}

export async function appendNotebookEntry(filePath: string, textToAppend: string): Promise<void> {
  let content = "";
  if (existsSync(filePath)) {
    content = await readFile(filePath, "utf-8");
  }

  let formattedText = textToAppend.trim();
  if (content.length > 0 && !content.endsWith("\n")) {
    formattedText = "\n" + formattedText;
  }
  formattedText += "\n";

  await writeFile(filePath, content + formattedText, "utf-8");
}
