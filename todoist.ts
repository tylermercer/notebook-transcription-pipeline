export interface CreateTaskParams {
  content: string;
  /** Omit for the user's Inbox */
  projectId?: string;
  /** YYYY-MM-DD */
  dueDate?: string;
}

export class TodoistClient {
  constructor(
    private readonly apiToken: string,
    private readonly baseUrl = "https://api.todoist.com/rest/v2",
  ) {}

  async createTask(params: CreateTaskParams): Promise<void> {
    const res = await fetch(`${this.baseUrl}/tasks`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiToken}`,
        "Content-Type": "application/json",
      },
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
