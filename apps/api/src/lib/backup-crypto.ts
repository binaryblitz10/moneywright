/**
 * Passphrase protection for downloaded backups.
 *
 * File layout: "MWBK1" | salt (16) | iv (12) | AES-256-GCM ciphertext (includes the auth tag).
 * The key is derived with PBKDF2-SHA256, so the file can be opened with any standard crypto tool.
 */

const MAGIC = new TextEncoder().encode('MWBK1')
const SALT_BYTES = 16
const IV_BYTES = 12
const PBKDF2_ITERATIONS = 600_000

export const MIN_PASSPHRASE_LENGTH = 8

async function deriveKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey']
  )
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: salt as BufferSource, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  )
}

export async function encryptBackup(data: Uint8Array, passphrase: string): Promise<Uint8Array> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES))
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES))
  const key = await deriveKey(passphrase, salt)
  const encrypted = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: iv as BufferSource },
      key,
      data as BufferSource
    )
  )

  const out = new Uint8Array(MAGIC.length + SALT_BYTES + IV_BYTES + encrypted.length)
  out.set(MAGIC, 0)
  out.set(salt, MAGIC.length)
  out.set(iv, MAGIC.length + SALT_BYTES)
  out.set(encrypted, MAGIC.length + SALT_BYTES + IV_BYTES)
  return out
}

/** Throws if the passphrase is wrong or the file is not a Moneywright backup */
export async function decryptBackup(file: Uint8Array, passphrase: string): Promise<Uint8Array> {
  const headerLength = MAGIC.length + SALT_BYTES + IV_BYTES
  if (file.length <= headerLength || !MAGIC.every((byte, i) => file[i] === byte)) {
    throw new Error('Not an encrypted Moneywright backup')
  }
  const salt = file.slice(MAGIC.length, MAGIC.length + SALT_BYTES)
  const iv = file.slice(MAGIC.length + SALT_BYTES, headerLength)
  const key = await deriveKey(passphrase, salt)
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: iv as BufferSource },
    key,
    file.slice(headerLength) as BufferSource
  )
  return new Uint8Array(plain)
}
