import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

function key(): Buffer {
  const value = process.env.CHAT2_CREDENTIAL_KEY;
  if (!value) throw new Error("CHAT2_CREDENTIAL_KEY is not configured");
  const decoded = Buffer.from(value, "base64");
  if (decoded.length !== 32) throw new Error("CHAT2_CREDENTIAL_KEY must decode to 32 bytes");
  return decoded;
}

export function encryptJson(value: unknown): Buffer {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([Buffer.from([1]), iv, tag, ciphertext]);
}

export function decryptJson<T>(encrypted: Buffer): T {
  if (encrypted[0] !== 1) throw new Error("Unsupported credential format");
  const decipher = createDecipheriv("aes-256-gcm", key(), encrypted.subarray(1, 13));
  decipher.setAuthTag(encrypted.subarray(13, 29));
  const plaintext = Buffer.concat([decipher.update(encrypted.subarray(29)), decipher.final()]).toString("utf8");
  return JSON.parse(plaintext) as T;
}
