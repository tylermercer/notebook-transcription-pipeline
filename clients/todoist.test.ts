import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TodoistClient } from "../todoist";

describe("TodoistClient", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends POST request to create task in Inbox", async () => {
    const mockFetch = vi.mocked(fetch);
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ id: "123" }), { status: 200 }),
    );

    const client = new TodoistClient("test-token");
    await client.createTask({
      content: "Test task",
      dueDate: "2026-09-01",
    });

    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.todoist.com/rest/v2/tasks",
      {
        method: "POST",
        headers: {
          Authorization: "Bearer test-token",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          content: "Test task",
          project_id: undefined,
          due_date: "2026-09-01",
        }),
      },
    );
  });

  it("sends POST request to create task in project", async () => {
    const mockFetch = vi.mocked(fetch);
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ id: "123" }), { status: 200 }),
    );

    const client = new TodoistClient("test-token");
    await client.createTask({
      content: "Project task",
      projectId: "proj-123",
    });

    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.todoist.com/rest/v2/tasks",
      {
        method: "POST",
        headers: {
          Authorization: "Bearer test-token",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          content: "Project task",
          project_id: "proj-123",
          due_date: undefined,
        }),
      },
    );
  });

  it("throws error when API response is not ok", async () => {
    const mockFetch = vi.mocked(fetch);
    mockFetch.mockResolvedValueOnce(
      new Response("Unauthorized", { status: 401 }),
    );

    const client = new TodoistClient("invalid-token");

    await expect(
      client.createTask({ content: "Task" }),
    ).rejects.toThrow("Todoist API error (401): Unauthorized");
  });
});
