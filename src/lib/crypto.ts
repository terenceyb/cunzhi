/** 数据包可选加密：AES-GCM + PBKDF2 */
const enc = new TextEncoder()
const dec = new TextDecoder()

function bufToB64(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf)
  let bin = ''
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
  return btoa(bin)
}

function b64ToBuf(b64: string): Uint8Array {
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

async function deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const baseKey = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey'])
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: salt as unknown as BufferSource, iterations: 250000, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

export interface EncryptedEnvelope {
  magic: 'CZDB'
  encrypted: true
  kdf: 'PBKDF2-SHA256'
  iterations: number
  salt: string
  iv: string
  data: string
  appVersion?: string
}

export async function encryptPackage(plain: string, password: string): Promise<EncryptedEnvelope> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const key = await deriveKey(password, salt)
  const cipher = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as unknown as BufferSource },
    key,
    enc.encode(plain),
  )
  return {
    magic: 'CZDB',
    encrypted: true,
    kdf: 'PBKDF2-SHA256',
    iterations: 250000,
    salt: bufToB64(salt),
    iv: bufToB64(iv),
    data: bufToB64(cipher),
  }
}

export async function decryptPackage(envelope: EncryptedEnvelope, password: string): Promise<string> {
  const salt = b64ToBuf(envelope.salt)
  const iv = b64ToBuf(envelope.iv)
  const key = await deriveKey(password, salt)
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: iv as unknown as BufferSource },
    key,
    b64ToBuf(envelope.data) as unknown as BufferSource,
  )
  return dec.decode(plain)
}
