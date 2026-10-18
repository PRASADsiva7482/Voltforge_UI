/** Validate Intel HEX against the only supported native CPU: ATmega328P (32 KiB flash). */
export function parseAvrHex(source: string): Uint16Array {
  if (source.length > 256_000) throw new Error('HEX file exceeds the ATmega328P firmware size limit')
  const flash = new Uint8Array(32 * 1024).fill(0xff)
  let base = 0, ended = false, dataBytes = 0
  for (const [index, raw] of source.split(/\r?\n/).entries()) {
    const line = raw.trim()
    if (!line) continue
    const invalid = (reason: string): never => { throw new Error(`Invalid Intel HEX at line ${index + 1}: ${reason}`) }
    if (ended) invalid('data follows end-of-file record')
    if (!/^:(?:[0-9a-fA-F]{2}){5,}$/.test(line)) invalid('malformed record')
    const bytes = (line.slice(1).match(/../g) || []).map(value => parseInt(value, 16))
    const [length, high, low, type] = bytes
    if (bytes.length !== length + 5) invalid('byte count mismatch')
    if (bytes.reduce((sum, value) => sum + value, 0) % 256 !== 0) invalid('checksum mismatch')
    const address = high * 256 + low
    if (type === 0) {
      if (base + address + length > flash.length) invalid('record exceeds 32 KiB ATmega328P flash')
      flash.set(bytes.slice(4, 4 + length), base + address)
      dataBytes += length
    } else if (type === 1) {
      if (length !== 0 || address !== 0) invalid('invalid end-of-file record')
      ended = true
    } else if (type === 2 || type === 4) {
      if (length !== 2 || address !== 0) invalid('invalid extended address')
      base = (bytes[4] * 256 + bytes[5]) * (type === 2 ? 16 : 65536)
    } else if (type === 3 || type === 5) {
      if (length !== 4 || address !== 0) invalid('invalid start address')
      // AVR starts at the reset vector; optional start-address records are not used.
    } else invalid('unsupported record type')
  }
  if (!ended || !dataBytes) throw new Error('Intel HEX requires firmware data and an end-of-file record')
  const words = new Uint16Array(flash.length / 2)
  for (let i = 0; i < words.length; i++) words[i] = flash[i * 2] | (flash[i * 2 + 1] << 8)
  return words
}
