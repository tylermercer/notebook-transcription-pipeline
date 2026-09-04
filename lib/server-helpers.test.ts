import { describe, expect, it } from "vitest";
import { getLanIp, validateToken } from "./server-helpers";

describe("server-helpers", () => {
  it("getLanIp returns an IP string", () => {
    const ip = getLanIp();
    expect(typeof ip).toBe("string");
    expect(ip.length).toBeGreaterThan(0);
  });

  it("validateToken validates token correctly", () => {
    const secret = "my-secret-token";
    expect(validateToken("http://192.168.1.5:8000/?t=my-secret-token", secret)).toBe(true);
    expect(validateToken("http://192.168.1.5:8000/?t=wrong-token", secret)).toBe(false);
    expect(validateToken("http://192.168.1.5:8000/", secret)).toBe(false);
  });
});
