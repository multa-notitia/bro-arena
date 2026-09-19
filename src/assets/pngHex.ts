/** Turn a hex dump of PNG bytes into a data URL. Hex survives a GitHub text push. */
export function pngHexToDataUrl(hex: string): string {
  const clean = hex.replace(/[^0-9a-fA-F]/g, '')
  if (clean.length % 2 !== 0) {
    throw new Error('PNG hex dump has an odd length')
  }
  const bytes = new Uint8Array(clean.length / 2)
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = Number.parseInt(clean.slice(i * 2, i * 2 + 2), 16)
  }
  const step = 0x8000
  let binary = ''
  for (let i = 0; i < bytes.length; i += step) {
    binary += String.fromCharCode(...bytes.subarray(i, i + step))
  }
  return `data:image/png;base64,${btoa(binary)}`
}
