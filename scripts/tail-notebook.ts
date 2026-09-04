#!/usr/bin/env bun
import { readNotebookTail } from "../lib/notebook";
import { loadConfig } from "../config";

async function tailNotebook() {
  const config = loadConfig(process.env as Record<string, string | undefined>, { allowMissing: true });
  const filePath = process.env.NOTEBOOK_FILE || config.notebookPath;
  const tail = await readNotebookTail(filePath, 10);
  if (!tail) {
    console.log(`Notebook file "${filePath}" does not exist yet.`);
    return;
  }
  console.log(tail);
}

tailNotebook().catch((err) => {
  console.error(err);
  process.exit(1);
});
