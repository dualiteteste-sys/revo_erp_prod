export type AesGcmCiphertext = `v1:${string}:${string}`;

function textToBytes(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

function bytesToText(bytes: ArrayBuffer): string {
  return new TextDecoder().decode(bytes);
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function importKey(masterKey: string): Promise<CryptoKey> {
  const raw = (masterKey ?? "").trim();
  if (!raw) throw new Error("MASTER_KEY_REQUIRED");

  // Prefer base64 32 bytes; fallback to sha256(raw).
  let keyBytes: Uint8Array | null = null;
  try {
    const decoded = base64ToBytes(raw);
    if (decoded.length >= 32) keyBytes = decoded.slice(0, 32);
  } catch {
    keyBytes = null;
  }
  if (!keyBytes) {
    const digest = await crypto.subtle.digest("SHA-256", textToBytes(raw) as unknown as BufferSource);
    keyBytes = new Uint8Array(digest);
  }

  // TS libdom can be strict about BufferSource typing; force an ArrayBuffer.
  const rawKey = new Uint8Array(keyBytes);
  return await crypto.subtle.importKey(
    "raw",
    rawKey as unknown as BufferSource,
    { name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function aesGcmEncrypt(params: {
  masterKey: string;
  plaintext: string;
  aad?: string;
}): Promise<AesGcmCiphertext> {
  const key = await importKey(params.masterKey);
  const iv = new Uint8Array(crypto.getRandomValues(new Uint8Array(12)));
  const aadBytes = params.aad ? textToBytes(params.aad) : null;
  const ct = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv: iv as unknown as BufferSource,
      additionalData: (aadBytes ?? undefined) as unknown as BufferSource | undefined,
    },
    key,
    textToBytes(params.plaintext) as unknown as BufferSource,
  );
  return `v1:${bytesToBase64(iv)}:${bytesToBase64(new Uint8Array(ct))}`;
}

export async function aesGcmDecrypt(params: {
  masterKey: string;
  ciphertext: AesGcmCiphertext | string;
  aad?: string;
}): Promise<string> {
  const raw = String(params.ciphertext ?? "").trim();
  const parts = raw.split(":");
  if (parts.length !== 3 || parts[0] !== "v1") throw new Error("CIPHERTEXT_INVALID");
  const iv = base64ToBytes(parts[1]);
  const data = base64ToBytes(parts[2]);
  const key = await importKey(params.masterKey);
  const aadBytes = params.aad ? textToBytes(params.aad) : null;
  const pt = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: iv as unknown as BufferSource,
      additionalData: (aadBytes ?? undefined) as unknown as BufferSource | undefined,
    },
    key,
    data as unknown as BufferSource,
  );
  return bytesToText(pt);
}
