export function secureSecretEqual(provided: string | null, configured: string | undefined): boolean {
  if (!provided || !configured) return false;

  const encoder = new TextEncoder();
  const providedBytes = encoder.encode(provided);
  const configuredBytes = encoder.encode(configured);
  if (providedBytes.length !== configuredBytes.length) return false;

  let difference = 0;
  for (let index = 0; index < configuredBytes.length; index += 1) {
    difference |= providedBytes[index] ^ configuredBytes[index];
  }
  return difference === 0;
}
