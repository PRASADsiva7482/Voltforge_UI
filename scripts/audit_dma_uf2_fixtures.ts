import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const fixtureDir = path.resolve(__dirname, '../src/features/simulator/__fixtures__');
const fixtureNames = [
  'pico_i2c0_tx_dma.uf2',
  'pico_i2c0_rx_dma.uf2',
  'pico_i2c1_tx_dma.uf2',
  'pico_i2c1_rx_dma.uf2',
  'pico_dma_pwm_negative.uf2'
];

console.log('========================================================================');
console.log('   VOLTFORGE PHASE 4.3.4.2 — UF2 DMA FIXTURE FORENSIC AUDIT');
console.log('========================================================================\n');

for (const name of fixtureNames) {
  const filePath = path.join(fixtureDir, name);
  const data = fs.readFileSync(filePath);
  const hash = crypto.createHash('sha256').update(data).digest('hex');

  console.log(`--- FIXTURE: ${name} ---`);
  console.log(`File Size:      ${data.length} bytes (${data.length / 512} UF2 blocks)`);
  console.log(`SHA-256 Hash:   ${hash}`);

  if (data.length !== 1024) {
    console.error(`Invalid UF2 size: ${data.length}`);
    continue;
  }

  // Parse Block 0
  const v0 = new DataView(data.buffer, data.byteOffset, 512);
  const m1_0 = v0.getUint32(0, true);
  const m2_0 = v0.getUint32(4, true);
  const flags_0 = v0.getUint32(8, true);
  const addr_0 = v0.getUint32(12, true);
  const psize_0 = v0.getUint32(16, true);
  const bnum_0 = v0.getUint32(20, true);
  const numbl_0 = v0.getUint32(24, true);
  const fam_0 = v0.getUint32(28, true);
  const mend_0 = v0.getUint32(508, true);
  const boot2Crc = v0.getUint32(32 + 252, true);

  console.log(`Block 0: Addr=0x${addr_0.toString(16)}, Block ${bnum_0}/${numbl_0}, FamilyID=0x${fam_0.toString(16)} (RP2040), Boot2 CRC=0x${boot2Crc.toString(16)}`);

  // Parse Block 1
  const v1 = new DataView(data.buffer, data.byteOffset + 512, 512);
  const m1_1 = v1.getUint32(0, true);
  const m2_1 = v1.getUint32(4, true);
  const addr_1 = v1.getUint32(12, true);
  const bnum_1 = v1.getUint32(20, true);
  const numbl_1 = v1.getUint32(24, true);
  const fam_1 = v1.getUint32(28, true);
  const mend_1 = v1.getUint32(508, true);

  const sp = v1.getUint32(32 + 0, true);
  const resetHandler = v1.getUint32(32 + 4, true);

  console.log(`Block 1: Addr=0x${addr_1.toString(16)}, Block ${bnum_1}/${numbl_1}, Initial SP=0x${sp.toString(16)}, Reset Handler=0x${resetHandler.toString(16)}`);

  // Disassemble instructions from offset 0x40 in Block 1 (address 0x10000140)
  console.log('Disassembly (Thumb-1 instructions from 0x10000140):');
  for (let off = 0x40; off < 0x90; off += 2) {
    const raw = v1.getUint16(32 + off, true);
    if (raw === 0 && off > 0x74) continue;
    const addr = 0x10000100 + off;
    console.log(`  0x${addr.toString(16)}: 0x${raw.toString(16).padStart(4, '0')}`);
  }
  console.log('Constants Pool (Words from 0x100001A0):');
  for (let off = 0xa0; off <= 0xbc; off += 4) {
    const word = v1.getUint32(32 + off, true);
    const addr = 0x10000100 + off;
    console.log(`  0x${addr.toString(16)}: 0x${word.toString(16).padStart(8, '0')}`);
  }
  console.log('');
}

