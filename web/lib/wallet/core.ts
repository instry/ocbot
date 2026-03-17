import { english, generateMnemonic, mnemonicToAccount } from 'viem/accounts'

export function generateNewMnemonic(): string {
  return generateMnemonic(english)
}

export function deriveFromMnemonic(mnemonic: string): { privateKey: string; address: string } {
  const account = mnemonicToAccount(mnemonic, { addressIndex: 0 })
  const hdKey = account.getHdKey()
  const pkBytes = hdKey.privateKey
  if (!pkBytes) throw new Error('Failed to derive private key')
  // Convert Uint8Array to hex string without Buffer
  const hex = Array.from(pkBytes).map(b => b.toString(16).padStart(2, '0')).join('')
  return {
    privateKey: `0x${hex}`,
    address: account.address,
  }
}

export async function encryptPrivateKey(
  privateKey: string,
  password: string,
): Promise<{ ciphertext: string; salt: string; iv: string }> {
  const enc = new TextEncoder()
  const salt = crypto.getRandomValues(new Uint8Array(32))
  const iv = crypto.getRandomValues(new Uint8Array(12))

  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    'PBKDF2',
    false,
    ['deriveKey'],
  )

  const aesKey = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 600_000, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt'],
  )

  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    aesKey,
    enc.encode(privateKey),
  )

  return {
    ciphertext: arrayBufferToBase64(ciphertext),
    salt: arrayBufferToBase64(salt),
    iv: arrayBufferToBase64(iv),
  }
}

export async function decryptPrivateKey(
  ciphertext: string,
  salt: string,
  iv: string,
  password: string,
): Promise<string> {
  const enc = new TextEncoder()
  const dec = new TextDecoder()

  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    'PBKDF2',
    false,
    ['deriveKey'],
  )

  const aesKey = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: base64ToUint8Array(salt), iterations: 600_000, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt'],
  )

  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: base64ToUint8Array(iv) },
    aesKey,
    base64ToUint8Array(ciphertext),
  )

  return dec.decode(plaintext)
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}

function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}
