/**
 * keyvault — where a visitor's own LLM API key lives.
 *
 * Threat model. The key belongs to the user, not to us. It must never reach our
 * servers as anything but a pass-through credential, and it must not sit in
 * browser storage as readable plaintext (extensions, shared machines, a stray
 * DevTools screenshot, a synced profile).
 *
 * How that's achieved:
 *
 *  1. The secret is encrypted with AES-256-GCM before it touches storage.
 *  2. The wrapping key is generated in the browser with `extractable: false` and
 *     stored *as a CryptoKey object* in IndexedDB. A non-extractable key cannot be
 *     serialised back into raw bytes by any script — not even ours. So the key
 *     material never exists as a readable value anywhere on disk or in JS memory.
 *  3. Storage is origin-scoped by the browser, so only this app can reach it.
 *  4. Nothing is ever written to localStorage, which is the easiest thing to scrape.
 *
 * This does not defend against an attacker who is already executing script on this
 * origin — nothing in a browser can. It does mean the key is never at rest in a
 * readable form, which is the property that actually matters for a stored secret.
 *
 * "Don't remember" mode keeps the secret in a module-local variable only: it dies
 * with the tab and never reaches storage at all.
 */

const DB_NAME = "archaitect-vault";
const DB_VERSION = 1;
const STORE = "vault";
const WRAP_KEY_ID = "wrap-key";
const SECRET_ID = "secret";

/** Secret fields for one provider. Everything here is sensitive. */
export type VaultSecret = {
  apiKey: string;
  /** AWS secret access key — Bedrock only. */
  apiSecret?: string;
  /** AWS session token — Bedrock with temporary credentials. */
  sessionToken?: string;
};

/** Session-only secret (never persisted). Cleared on reload by construction. */
let ephemeral: VaultSecret | null = null;

/** WebCrypto + IndexedDB are both required to persist. Private-mode Safari and
 *  insecure origins (http:// on a non-localhost host) lack one or the other. */
export function canPersist(): boolean {
  return (
    typeof indexedDB !== "undefined" &&
    typeof crypto !== "undefined" &&
    typeof crypto.subtle !== "undefined"
  );
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB unavailable"));
    req.onblocked = () => reject(new Error("IndexedDB blocked"));
  });
}

function idbGet<T>(db: IDBDatabase, key: string): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE, "readonly").objectStore(STORE).get(key);
    req.onsuccess = () => resolve(req.result as T | undefined);
    req.onerror = () => reject(req.error);
  });
}

function idbPut(db: IDBDatabase, key: string, value: unknown): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function idbDelete(db: IDBDatabase, key: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * The AES-GCM key used to wrap the secret. Created once per browser profile and
 * deliberately non-extractable, so it can be *used* but never read out.
 */
async function wrapKey(db: IDBDatabase): Promise<CryptoKey> {
  const existing = await idbGet<CryptoKey>(db, WRAP_KEY_ID);
  if (existing) return existing;
  const key = await crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    false, // extractable: false — the whole point
    ["encrypt", "decrypt"]
  );
  await idbPut(db, WRAP_KEY_ID, key);
  return key;
}

type StoredSecret = { iv: Uint8Array; data: ArrayBuffer };

/**
 * Persist the secret, encrypted. `remember: false` keeps it in memory only.
 * Returns whether it was actually persisted, so the UI can be honest about it.
 */
export async function saveSecret(secret: VaultSecret, remember: boolean): Promise<boolean> {
  ephemeral = secret;
  if (!remember) {
    await clearPersisted();
    return false;
  }
  if (!canPersist()) return false;
  try {
    const db = await openDb();
    const key = await wrapKey(db);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const data = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      key,
      new TextEncoder().encode(JSON.stringify(secret))
    );
    await idbPut(db, SECRET_ID, { iv, data } satisfies StoredSecret);
    db.close();
    return true;
  } catch {
    // Persisting is best-effort; the in-memory copy still works for this session.
    return false;
  }
}

/** Load the secret — from memory if present this session, else from IndexedDB. */
export async function loadSecret(): Promise<VaultSecret | null> {
  if (ephemeral) return ephemeral;
  if (!canPersist()) return null;
  try {
    const db = await openDb();
    const [key, stored] = await Promise.all([
      idbGet<CryptoKey>(db, WRAP_KEY_ID),
      idbGet<StoredSecret>(db, SECRET_ID),
    ]);
    db.close();
    if (!key || !stored) return null;
    const plain = await crypto.subtle.decrypt(
      // Copied into a fresh buffer: what comes back from a structured clone isn't
      // guaranteed to be backed by a plain ArrayBuffer.
      { name: "AES-GCM", iv: new Uint8Array(stored.iv) },
      key,
      stored.data
    );
    const secret = JSON.parse(new TextDecoder().decode(plain)) as VaultSecret;
    ephemeral = secret;
    return secret;
  } catch {
    // Tampered ciphertext or a rotated wrap key — treat as "no key saved".
    return null;
  }
}

/** Remove the encrypted copy but keep the session copy (used by "don't remember"). */
async function clearPersisted(): Promise<void> {
  if (!canPersist()) return;
  try {
    const db = await openDb();
    await idbDelete(db, SECRET_ID);
    db.close();
  } catch {
    /* nothing to clear */
  }
}

/** Forget the key entirely — memory and disk. */
export async function forgetSecret(): Promise<void> {
  ephemeral = null;
  await clearPersisted();
}

/** Mask a key for display: never render the middle of a secret. */
export function maskKey(key: string): string {
  const k = key.trim();
  if (k.length <= 10) return "•".repeat(Math.max(k.length, 6));
  return `${k.slice(0, 5)}${"•".repeat(12)}${k.slice(-4)}`;
}
