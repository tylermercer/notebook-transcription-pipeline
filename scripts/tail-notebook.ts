#!/usr/bin/env bun
import { readNotebookTail } from "../lib/notebook";

async function tailNotebook() {
  const filePath = process.env.NOTEBOOK_FILE || "notebook.md";
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
