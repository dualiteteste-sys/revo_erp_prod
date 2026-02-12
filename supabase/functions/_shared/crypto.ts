export async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return bytesToHex(new Uint8Array(digest));
}

export async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return bytesToHex(new Uint8Array(sig));
}

export async function hmacSha256Base64(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return bytesToBase64(new Uint8Array(sig));
}

export function timingSafeEqual(a: string, b: string): boolean {
  const aa = new TextEncoder().encode(a);
  const bb = new TextEncoder().encode(b);
  if (aa.length !== bb.length) return false;
  let diff = 0;
  for (let i = 0; i < aa.length; i++) diff |= aa[i] ^ bb[i];
  return diff === 0;
}

export type AesGcmCiphertext = string; // format: v1:<iv_b64>:<cipher_b64>

export async function aesGcmEncryptToString(params: {
  masterKey: string;
  plaintext: string;
  aad?: string;
}): Promise<AesGcmCiphertext> {
  const key = await importAesGcmKey(params.masterKey);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const aadBytes = params.aad ? new TextEncoder().encode(params.aad) : undefined;
  const ct = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: aadBytes },
    key,
    new TextEncoder().encode(params.plaintext),
  );
  return `v1:${bytesToBase64(iv)}:${bytesToBase64(new Uint8Array(ct))}`;
}

export async function aesGcmDecryptFromString(params: {
  masterKey: string;
  ciphertext: AesGcmCiphertext;
  aad?: string;
}): Promise<string> {
  const raw = String(params.ciphertext ?? "").trim();
  const parts = raw.split(":");
  if (parts.length !== 3 || parts[0] !== "v1") throw new Error("CIPHERTEXT_INVALID");
  const iv = base64ToBytes(parts[1]);
  const data = base64ToBytes(parts[2]);
  const key = await importAesGcmKey(params.masterKey);
  const aadBytes = params.aad ? new TextEncoder().encode(params.aad) : undefined;
  const pt = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv, additionalData: aadBytes },
    key,
    data,
  );
  return new TextDecoder().decode(pt);
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  // deno supports btoa
  return btoa(binary);
}

function base64ToBytes(b64: string): Uint8Array {
  const raw = String(b64 ?? "").trim();
  const bin = atob(raw);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function importAesGcmKey(masterKey: string): Promise<CryptoKey> {
  const raw = String(masterKey ?? "").trim();
  if (!raw) throw new Error("MASTER_KEY_REQUIRED");

  // Prefer base64 32 bytes, but accept arbitrary strings (hashed to 32 bytes).
  let keyBytes: Uint8Array | null = null;
  try {
    const decoded = base64ToBytes(raw);
    if (decoded.length >= 32) keyBytes = decoded.slice(0, 32);
  } catch {
    keyBytes = null;
  }
  if (!keyBytes) {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw));
    keyBytes = new Uint8Array(digest);
  }

  return await crypto.subtle.importKey("raw", keyBytes, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}
