export function getNotebookTail(content: string, lineCount = 10): string {
  if (!content) return "";
  const lines = content.split("\n");
  const last = lines.slice(-lineCount);
  return last.join("\n");
}

export function getContextContent(agentsMd: string, notebookMd: string, lineCount = 10): string {
  const tail = getNotebookTail(notebookMd, lineCount);
  return `## AGENTS.md Instructions\n\n${agentsMd}\n\n## notebook.md (Tail)\n\n${tail}`;
}
