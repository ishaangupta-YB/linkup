/** Random ids from the platform CSPRNG; readable, url-safe, 12 characters by default. */
export function newId(length = 12): string {
  const alphabet = '0123456789abcdefghijklmnopqrstuvwxyz'
  const bytes = crypto.getRandomValues(new Uint8Array(length))
  let out = ''
  for (const b of bytes) out += alphabet[b % alphabet.length]
  return out
}
