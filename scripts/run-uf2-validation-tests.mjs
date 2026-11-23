import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const server = await createServer({
  appType: 'custom',
  logLevel: 'error',
  optimizeDeps: { noDiscovery: true },
  server: { middlewareMode: true },
});

try {
  const {
    parseUF2,
    validateRp2040UF2,
    extractRp2040FlashImage,
    RP2040_FAMILY_ID,
    UF2_MAGIC_START_0,
    UF2_MAGIC_START_1,
    UF2_MAGIC_END,
    UF2_FLAG_FAMILY_ID_PRESENT,
  } = await server.ssrLoadModule('/src/features/simulator/uf2Parser.ts');

  // 1. Real fixture validation
  const fixturePath = path.resolve(__dirname, '../src/features/simulator/__fixtures__/pico_blink_rp2040.uf2');
  const buffer = fs.readFileSync(fixturePath);
  const parsed = parseUF2(buffer);
  assert.equal(parsed.valid, true, 'Real fixture must parse successfully');
  assert.equal(parsed.blocks.length, 1028, 'Real blink fixture must contain 1028 blocks');
  assert.equal(parsed.familyId, RP2040_FAMILY_ID, 'Family ID must equal RP2040 (0xE48BFF56)');

  const validated = validateRp2040UF2(parsed);
  assert.equal(validated.valid, true, 'RP2040 validation must pass');
  assert.equal(validated.minAddress, 0x10000000, 'Flash min address must be 0x10000000');
  assert.equal(validated.maxAddress, 0x10040400, 'Flash max address must match 1028 blocks');

  const flash = extractRp2040FlashImage(parsed);
  assert.equal(flash.length, 2 * 1024 * 1024, 'Flash image must be 2 MiB');

  // 2. Empty input
  assert.equal(parseUF2(new Uint8Array(0)).valid, false);

  // 3. Non-multiple of 512
  assert.equal(parseUF2(new Uint8Array(511)).valid, false);

  // 4. Invalid magic
  const corruptedMagic = new Uint8Array(buffer.subarray(0, 512));
  corruptedMagic[0] = 0xff;
  assert.equal(parseUF2(corruptedMagic).valid, false);

  // 5. Invalid family ID
  const badFam = new Uint8Array(buffer.subarray(0, 512));
  new DataView(badFam.buffer, badFam.byteOffset).setUint32(28, 0x12345678, true);
  const badFamParsed = parseUF2(badFam);
  const badFamValidated = validateRp2040UF2(badFamParsed);
  assert.equal(badFamValidated.valid, false, 'Invalid family ID must be rejected');

  console.log('PASS RP2040 UF2 parser, magic headers, 512B framing, family ID, address bounds, and flash image extraction');
} finally {
  await server.close();
}

