import qrcode from "qrcode-terminal";

export function printQr(url: string): void {
  qrcode.generate(url, { small: true });
}
