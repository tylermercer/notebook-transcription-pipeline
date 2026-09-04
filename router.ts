import { isDestinationEnabled, type AppConfig } from "./config";
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
  /** When true, outputs actions without making side effects. */
  dryRun?: boolean;
  /** Optional custom logger function (defaults to console.log). */
  logger?: (msg: string) => void;
  /** Injectable for testing; defaults to real "today". */
  today?: () => string;
}

function todayIso(deps: RouteDeps): string {
  if (deps.today) return deps.today();
  return new Date().toISOString().slice(0, 10);
}

async function getNextAvailableEDate(
  storage: KVStorage,
  startDateStr: string,
  claimedDates: Set<string>,
): Promise<string> {
  const [yearStr, monthStr, dayStr] = startDateStr.split("-");
  const year = Number(yearStr);
  const month = Number(monthStr);
  const day = Number(dayStr);

  const current = new Date(Date.UTC(year, month - 1, day));

  while (true) {
    const isoDate = current.toISOString().slice(0, 10);
    if (!claimedDates.has(isoDate) && !(await storage.has(isoDate))) {
      claimedDates.add(isoDate);
      return isoDate;
    }
    current.setUTCDate(current.getUTCDate() + 1);
  }
}

/** Routes a single note to every destination implied by its tags. */
export async function routeNote(
  note: Note,
  deps: RouteDeps,
  claimedDates: Set<string> = new Set(),
): Promise<void> {
  const log = deps.logger ?? console.log;

  for (const tag of note.tags) {
    if (!isDestinationEnabled(deps.config, tag)) {
      log(`[DISABLED] Destination tag "${tag}" is disabled in config. Skipping routing.`);
      continue;
    }

    if (deps.dryRun) {
      switch (tag) {
        case "PW":
          log(
            `[DRY RUN] [PW] Append note to PW storage (${deps.config.storage.pwFolder}) for date ${note.date}: "${note.text}"`,
          );
          break;

        case "E": {
          const targetDate = await getNextAvailableEDate(
            deps.eStorage,
            todayIso(deps),
            claimedDates,
          );
          log(
            `[DRY RUN] [E] Save note to E storage (${deps.config.storage.eFolder}) for date ${targetDate} (createdDate: ${note.date}): "${note.text}"`,
          );
          break;
        }

        case "T":
          log(
            `[DRY RUN] [T] Create Todoist task in Inbox (due: ${todayIso(deps)}): "${note.text}"`,
          );
          break;

        case "I":
          log(
            `[DRY RUN] [I] Create Todoist task in Innerhelm project (${deps.config.todoist.innerhelmProjectId}): "${note.text}"`,
          );
          break;

        case "EQ":
          log(
            `[DRY RUN] [EQ] Create Todoist task in EQP project (${deps.config.todoist.eqpProjectId}): "${note.text}"`,
          );
          break;

        case "R":
          log(
            `[DRY RUN] [R] Create Readwise highlight for date ${note.date}: "${note.text}"`,
          );
          break;

        case "W":
          log(
            `[DRY RUN] [W] Send email via Resend to ${deps.config.resend.toEmail} from ${deps.config.resend.fromEmail}: "${note.text}"`,
          );
          break;

        default:
          log(
            `[DRY RUN] Skipping unknown tag "${tag}" on note dated ${note.date}`,
          );
      }
      continue;
    }

    switch (tag) {
      case "PW":
        await appendNoteToDoc(deps.pwStorage, note.date, note.text);
        break;

      case "E": {
        const targetDate = await getNextAvailableEDate(
          deps.eStorage,
          todayIso(deps),
          claimedDates,
        );
        const content = `---\ncreatedDate: ${note.date}\n---\n\n${note.text}`;
        await deps.eStorage.put(targetDate, content);
        break;
      }

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
  const claimedDates = new Set<string>();
  for (const note of notes) {
    await routeNote(note, deps, claimedDates);
  }
}
