#!/usr/bin/env bun
import { existsSync } from "node:fs";

async function appendNotebook() {
  const args = process.argv.slice(2);
  const textToAppend = args.join(" ");

  if (!textToAppend.trim()) {
    console.error('Usage: bun run scripts/append-notebook.ts "<text to append>"');
    process.exit(1);
  }

  const filePath = process.env.NOTEBOOK_FILE || "notebook.md";
  let content = "";
  if (existsSync(filePath)) {
    content = await Bun.file(filePath).text();
  }

  let formattedText = textToAppend.trim();
  if (content.length > 0 && !content.endsWith("\n")) {
    formattedText = "\n" + formattedText;
  }
  formattedText += "\n";

  await Bun.write(filePath, content + formattedText);
  console.log(`Appended entry to ${filePath}.`);
}

appendNotebook().catch((err) => {
  console.error(err);
  process.exit(1);
});
