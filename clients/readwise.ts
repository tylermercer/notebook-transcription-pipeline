export class ReadwiseClient {
  constructor(
    private readonly apiToken: string,
    private readonly baseUrl = "https://readwise.io/api/v2",
  ) {}

  async createHighlight(text: string, noteDate: string): Promise<void> {
    const res = await fetch(`${this.baseUrl}/highlights/`, {
      method: "POST",
      headers: {
        Authorization: `Token ${this.apiToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        highlights: [
          {
            text,
            title: "Personal Notes",
            author: "Tyler Mercer",
            note: `Note date: ${noteDate}`,
          },
        ],
      }),
    });

    if (!res.ok) {
      throw new Error(
        `Readwise API error (${res.status}): ${await res.text()}`,
      );
    }
  }
}
