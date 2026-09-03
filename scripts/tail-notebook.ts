#!/usr/bin/env bun
import { existsSync } from "node:fs";

async function tailNotebook() {
  const filePath = process.env.NOTEBOOK_FILE || "notebook.md";
  if (!existsSync(filePath)) {
    console.log(`Notebook file "${filePath}" does not exist yet.`);
    return;
  }

  const content = await Bun.file(filePath).text();
  const lines = content.split("\n");
  const last10 = lines.slice(-10);
  console.log(last10.join("\n"));
}

tailNotebook().catch((err) => {
  console.error(err);
  process.exit(1);
});
