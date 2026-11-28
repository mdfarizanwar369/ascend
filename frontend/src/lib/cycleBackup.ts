import { validateCycleEntries, type CycleEntries } from "./cycleLog";

export const cycleBackupName = "ascend-private-backup.json";
export const cycleBackupMaxBytes = 1_000_000;
const format = "ascend-cycle-backup";
const version = 1;
const encoder = new TextEncoder();

function encode(bytes: Uint8Array) {
  return btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join(""));
}

function decode(value: unknown) {
  if (typeof value !== "string") throw new Error("Invalid backup.");
  return Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
}

async function keyFor(password: string, salt: Uint8Array<ArrayBuffer>) {
  const secret = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "PBKDF2", hash: "SHA-256", iterations: 600_000, salt }, secret,
    { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}

export async function createCycleBackup(entries: CycleEntries, password: string) {
  if (password.length < 12) throw new Error("Use a password of at least 12 characters.");
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await keyFor(password, salt);
  const data = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoder.encode(JSON.stringify(entries)));
  const backup = JSON.stringify({ format, version, salt: encode(salt), iv: encode(iv), data: encode(new Uint8Array(data)) });
  if (backup.length > cycleBackupMaxBytes) throw new Error("This backup file is too large.");
  return backup;
}

export async function openCycleBackup(text: string, password: string, today: string) {
  if (text.length > cycleBackupMaxBytes) throw new Error("This backup file is too large.");
  const envelope = JSON.parse(text);
  if (envelope?.format !== format || envelope.version !== version) throw new Error("Unsupported backup format.");
  const salt = decode(envelope.salt);
  const iv = decode(envelope.iv);
  const data = decode(envelope.data);
  if (salt.length !== 16 || iv.length !== 12 || data.length < 16) throw new Error("Invalid backup.");
  const key = await keyFor(password, salt);
  const bytes = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, data);
  const entries = validateCycleEntries(JSON.parse(new TextDecoder().decode(bytes)));
  for (const day of Object.keys(entries)) {
    const date = new Date(`${day}T00:00:00Z`);
    if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== day || day > today) {
      throw new Error("Invalid backup date.");
    }
  }
  return entries;
}
