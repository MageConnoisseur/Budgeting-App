export function userIdFromToken(token: string): string | null {
  const part = token.split('.')[1]
  if (!part) return null
  try {
    const json = JSON.parse(decodeBase64Url(part)) as { sub?: unknown }
    return typeof json.sub === 'string' && json.sub ? json.sub : null
  } catch {
    return null
  }
}

function decodeBase64Url(input: string): string {
  const normalized = input.replace(/-/g, '+').replace(/_/g, '/')
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4)
  const binary = globalThis.atob(padded)
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}
