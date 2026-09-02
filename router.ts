import type { AppConfig } from "./config";
import { appendNoteToDoc, type KVStorage } from "./storage";
import type { TodoistClient } from "./clients/todoist";
import type { ReadwiseClient } from "./clients/readwise";
import type { ResendClient } from "./clients/resend";
import type { Note } from "./types";

export interface RouteDeps {
  config: AppConfig;
  pwStorage: KVStorage;
  eStorage: KVStorage;
  todoist: TodoistClient;
  readwise: ReadwiseClient;
  resend: ResendClient;
  /** Injectable for testing; defaults to real "today". */
  today?: () => string;
}

function todayIso(deps: RouteDeps): string {
  if (deps.today) return deps.today();
  return new Date().toISOString().slice(0, 10);
}

/** Routes a single note to every destination implied by its tags. */
export async function routeNote(note: Note, deps: RouteDeps): Promise<void> {
  for (const tag of note.tags) {
    switch (tag) {
      case "PW":
        await appendNoteToDoc(deps.pwStorage, note.date, note.text);
        break;

      case "E":
        await appendNoteToDoc(deps.eStorage, note.date, note.text);
        break;

      case "T":
        await deps.todoist.createTask({
          content: note.text,
          dueDate: todayIso(deps),
        });
        break;

      case "I":
        await deps.todoist.createTask({
          content: note.text,
          projectId: deps.config.todoist.innerhelmProjectId,
        });
        break;

      case "EQ":
        await deps.todoist.createTask({
          content: note.text,
          projectId: deps.config.todoist.eqpProjectId,
        });
        break;

      case "R":
        await deps.readwise.createHighlight(note.text, note.date);
        break;

      case "W":
        await deps.resend.sendEmail({
          from: deps.config.resend.fromEmail,
          to: deps.config.resend.toEmail,
          subject: `Notebook entry — ${note.date}`,
          text: note.text,
        });
        break;

      default:
        console.warn(`Skipping unknown tag "${tag}" on note dated ${note.date}`);
    }
  }
}

export async function routeNotes(notes: Note[], deps: RouteDeps): Promise<void> {
  for (const note of notes) {
    await routeNote(note, deps);
  }
}
