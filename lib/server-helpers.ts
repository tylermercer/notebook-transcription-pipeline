import networkInterfaces from "node:os";

export function getLanIp(): string {
  const interfaces = networkInterfaces.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const net of interfaces[name] || []) {
      // Pick first non-internal IPv4 address
      if (net.family === "IPv4" && !net.internal) {
        return net.address;
      }
    }
  }
  return "127.0.0.1";
}

export function validateToken(reqUrl: string, expectedToken: string): boolean {
  try {
    const url = new URL(reqUrl);
    const token = url.searchParams.get("t");
    return token === expectedToken;
  } catch {
    return false;
  }
}
