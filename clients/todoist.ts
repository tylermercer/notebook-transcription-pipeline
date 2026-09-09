export interface CreateTaskParams {
  content: string;
  /** Omit for the user's Inbox */
  projectId?: string;
  /** YYYY-MM-DD */
  dueDate?: string;
  /** Sent as X-Request-Id; Todoist discards a POST with a previously-seen ID. */
  idempotencyKey?: string;
}

export class TodoistClient {
  constructor(
    private readonly apiToken: string,
    private readonly baseUrl = "https://api.todoist.com/rest/v2",
  ) {}

  async createTask(params: CreateTaskParams): Promise<void> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.apiToken}`,
      "Content-Type": "application/json",
    };
    if (params.idempotencyKey) {
      headers["X-Request-Id"] = params.idempotencyKey;
    }

    const res = await fetch(`${this.baseUrl}/tasks`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        content: params.content,
        project_id: params.projectId,
        due_date: params.dueDate,
      }),
    });

    if (!res.ok) {
      throw new Error(
        `Todoist API error (${res.status}): ${await res.text()}`,
      );
    }
  }
}
