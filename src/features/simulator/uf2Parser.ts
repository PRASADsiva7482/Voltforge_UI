/**
 * ═══════════════════════════════════════════════════════════════════════════════════════
 * VoltForge — High-Performance UF2 (USB Flashing Format) Parser & Validator
 * 
 * Supports:
 * - Generic UF2 v2 binary container parsing
 * - Little-endian 512-byte block validation (Magic 0/1 and End)
 * - Flag handling (NOT_MAIN_FLASH, FILE_CONTAINER, FAMILY_ID, MD5)
 * - Dedicated RP2040 MCU validation layer (Family ID 0xE48BFF56, memory bounds)
 * - Configurable board flash capacity & memory ranges (Flash and SRAM)
 * - Separation of generic UF2 validity, destination validity, and physical flash constraints
 * - Multi-family container filtering (e.g. Universal UF2 files)
 * - Cortex-M0+ Vector Table discovery, validation (MSP, Reset Handler, Thumb bit)
 * - Extraction of continuous flash memory images (erased state 0xFF)
 * 
 * Zero external dependencies. Browser WebWorker and Node.js compatible.
 * ═══════════════════════════════════════════════════════════════════════════════════════
 */

// ─── UF2 Constants ───────────────────────────────────────────────────────────────────

export const UF2_BLOCK_SIZE = 512;
export const UF2_MAX_PAYLOAD_SIZE = 476;

export const UF2_MAGIC_START_0 = 0x0a324655; // "UF2\n"
export const UF2_MAGIC_START_1 = 0x9e5d5157;
export const UF2_MAGIC_END     = 0x0ab16f30;

/** Official Raspberry Pi RP2040 UF2 Family ID */
export const RP2040_FAMILY_ID = 0xe48bff56;

/** Standard Raspberry Pi Pico Flash Base Address (XIP region) */
export const RP2040_DEFAULT_FLASH_START = 0x10000000;

/** Standard Raspberry Pi Pico Default Flash Size (2 MiB) */
export const RP2040_DEFAULT_FLASH_SIZE = 2 * 1024 * 1024;

/** Standard RP2040 SRAM Start Address (264 KiB total: striped 256K + two 4K banks) */
export const RP2040_SRAM_START = 0x20000000;
/** Standard RP2040 SRAM Size (264 KiB) */
export const RP2040_SRAM_SIZE = 264 * 1024;
/** Standard RP2040 SRAM End Address (0x20042000) */
export const RP2040_SRAM_END = RP2040_SRAM_START + RP2040_SRAM_SIZE;

/** Standard RP2040 Boot ROM Base Address (16 KiB) */
export const RP2040_BOOTROM_START = 0x00000000;
export const RP2040_BOOTROM_SIZE = 16 * 1024;
export const RP2040_BOOTROM_END = RP2040_BOOTROM_START + RP2040_BOOTROM_SIZE;

/** Default Pico SDK Vector Table Offset (after 256-byte Boot2) */
export const RP2040_DEFAULT_VECTOR_TABLE_OFFSET = 0x100;
export const RP2040_DEFAULT_VECTOR_TABLE_ADDRESS = RP2040_DEFAULT_FLASH_START + RP2040_DEFAULT_VECTOR_TABLE_OFFSET; // 0x10000100

// ─── UF2 Block Flags ─────────────────────────────────────────────────────────────────

export const UF2_FLAG_NOT_MAIN_FLASH        = 0x00000001;
export const UF2_FLAG_FILE_CONTAINER        = 0x00001000;
export const UF2_FLAG_FAMILY_ID_PRESENT     = 0x00002000;
export const UF2_FLAG_MD5_CHECKSUM_PRESENT  = 0x00004000;

// ─── Interfaces ──────────────────────────────────────────────────────────────────────

export interface UF2Block {
  flags: number;
  targetAddress: number;
  payloadSize: number;
  blockNumber: number;
  totalBlocks: number;
  familyId: number | null;
  fileSize: number | null;
  isNotMainFlash: boolean;
  isFileContainer: boolean;
  hasFamilyId: boolean;
  hasMd5Checksum: boolean;
  data: Uint8Array;
}

export interface UF2ParseOptions {
  /** Filter and extract only blocks matching this target family ID (e.g. for multi-architecture UF2s) */
  targetFamilyId?: number;
  /** Allow multiple distinct family IDs without rejecting the container as conflicting */
  allowMultiFamily?: boolean;
}

export interface UF2ParseResult {
  valid: boolean;
  familyId: number | null;
  allFamilyIds: number[];
  blocks: UF2Block[];
  errors: string[];
  warnings: string[];
  totalPayloadBytes: number;
}

export interface Rp2040BoardConfig {
  flashStart?: number;
  flashSize?: number;
  pageSize?: number;
  sramStart?: number;
  sramSize?: number;
  vectorTableAddress?: number;
  requireStrictPageAlignment?: boolean;
  requireWordAlignment?: boolean;
  allowedMemoryRegions?: { start: number; end: number; name: string }[];
}

export interface Rp2040ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  minAddress: number | null;
  maxAddress: number | null;
  totalFirmwareBytes: number;
  blockCount: number;
  familyId: number | null;
}

export interface Rp2040VectorTable {
  address: number;
  initialSP: number;
  resetHandler: number;
  nmiHandler: number;
  hardFaultHandler: number;
  svCallHandler?: number;
  pendSVHandler?: number;
  sysTickHandler?: number;
  isThumb: boolean;
  entryPC: number;
  hasBoot2: boolean;
  boot2Crc?: number;
}

export interface Rp2040VectorValidationResult {
  valid: boolean;
  vectorTable: Rp2040VectorTable | null;
  errors: string[];
  warnings: string[];
}

export interface ExtractFlashOptions {
  trimToFirmwareSize?: boolean;
}

// ─── Generic UF2 Parser ─────────────────────────────────────────────────────────────

/**
 * Parses raw UF2 binary data into structured blocks and validates generic
 * UF2 container invariants.
 * 
 * Rejects:
 * - Empty input
 * - Lengths not divisible by 512
 * - Corrupted start/end magic numbers
 * - Payload sizes exceeding 476 bytes
 * - Total-block count inconsistencies within a family stream
 * - Missing or duplicate block numbers within a stream
 * - Conflicting family IDs (unless allowMultiFamily/targetFamilyId is specified)
 */
export function parseUF2(
  input: ArrayBuffer | Uint8Array,
  options?: UF2ParseOptions
): UF2ParseResult {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  const errors: string[] = [];
  const warnings: string[] = [];
  const rawBlocks: UF2Block[] = [];

  if (bytes.length === 0) {
    return {
      valid: false,
      familyId: null,
      allFamilyIds: [],
      blocks: [],
      errors: ['UF2 input is empty'],
      warnings: [],
      totalPayloadBytes: 0,
    };
  }

  if (bytes.length % UF2_BLOCK_SIZE !== 0) {
    return {
      valid: false,
      familyId: null,
      allFamilyIds: [],
      blocks: [],
      errors: [`UF2 binary length ${bytes.length} is not a multiple of ${UF2_BLOCK_SIZE} bytes`],
      warnings: [],
      totalPayloadBytes: 0,
    };
  }

  const numBlocks = bytes.length / UF2_BLOCK_SIZE;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const detectedFamilyIds = new Set<number>();

  for (let i = 0; i < numBlocks; i++) {
    const offset = i * UF2_BLOCK_SIZE;

    // 1. Validate 32-bit Magic Numbers
    const magicStart0 = view.getUint32(offset, true);
    const magicStart1 = view.getUint32(offset + 4, true);
    const magicEnd     = view.getUint32(offset + 508, true);

    if (magicStart0 !== UF2_MAGIC_START_0) {
      errors.push(
        `Block ${i}: invalid start magic 0 (0x${magicStart0.toString(16).padStart(8, '0')}, expected 0x0A324655)`
      );
      break;
    }
    if (magicStart1 !== UF2_MAGIC_START_1) {
      errors.push(
        `Block ${i}: invalid start magic 1 (0x${magicStart1.toString(16).padStart(8, '0')}, expected 0x9E5D5157)`
      );
      break;
    }
    if (magicEnd !== UF2_MAGIC_END) {
      errors.push(
        `Block ${i}: invalid end magic (0x${magicEnd.toString(16).padStart(8, '0')}, expected 0x0AB16F30)`
      );
      break;
    }

    // 2. Unpack Fields
    const flags         = view.getUint32(offset + 8, true);
    const targetAddress = view.getUint32(offset + 12, true);
    const payloadSize   = view.getUint32(offset + 16, true);
    const blockNumber   = view.getUint32(offset + 20, true);
    const totalBlocks   = view.getUint32(offset + 24, true);
    const familyOrSize  = view.getUint32(offset + 28, true);

    // 3. Validate Payload Size
    if (payloadSize > UF2_MAX_PAYLOAD_SIZE) {
      errors.push(
        `Block ${i}: payload size ${payloadSize} exceeds maximum allowed 476 bytes`
      );
    }

    // 4. Flag Interpretation
    const isNotMainFlash   = (flags & UF2_FLAG_NOT_MAIN_FLASH) !== 0;
    const isFileContainer   = (flags & UF2_FLAG_FILE_CONTAINER) !== 0;
    const hasFamilyId       = (flags & UF2_FLAG_FAMILY_ID_PRESENT) !== 0;
    const hasMd5Checksum    = (flags & UF2_FLAG_MD5_CHECKSUM_PRESENT) !== 0;

    let familyId: number | null = null;
    let fileSize: number | null = null;

    if (hasFamilyId) {
      familyId = familyOrSize;
      detectedFamilyIds.add(familyId);
    }
    if (isFileContainer) {
      fileSize = familyOrSize;
      warnings.push(`Block ${i}: file-container flag asserted (fileSize: ${fileSize})`);
    }
    if (hasMd5Checksum) {
      warnings.push(`Block ${i}: md5-checksum flag asserted`);
    }

    if (isNotMainFlash) {
      warnings.push(`Block ${i}: not-main-flash flag asserted (target: 0x${targetAddress.toString(16)})`);
    }

    // 5. Extract active payload bytes (padding up to 476 is ignored)
    const data = bytes.subarray(offset + 32, offset + 32 + Math.min(payloadSize, UF2_MAX_PAYLOAD_SIZE));

    rawBlocks.push({
      flags,
      targetAddress,
      payloadSize,
      blockNumber,
      totalBlocks,
      familyId,
      fileSize,
      isNotMainFlash,
      isFileContainer,
      hasFamilyId,
      hasMd5Checksum,
      data,
    });
  }

  // If header magics failed, return immediately
  if (errors.length > 0) {
    return {
      valid: false,
      familyId: null,
      allFamilyIds: Array.from(detectedFamilyIds),
      blocks: [],
      errors,
      warnings,
      totalPayloadBytes: 0,
    };
  }

  // 6. Multi-Family Conflict Evaluation
  const allFamilyIds = Array.from(detectedFamilyIds);
  if (!options?.allowMultiFamily && options?.targetFamilyId === undefined && allFamilyIds.length > 1) {
    errors.push(
      `Conflicting family IDs found across blocks: ${allFamilyIds.map(f => '0x' + f.toString(16)).join(' and ')}`
    );
  }

  // Filter blocks by target family if requested
  const targetFamily = options?.targetFamilyId;
  const filteredBlocks = (targetFamily !== undefined)
    ? rawBlocks.filter(b => b.familyId === targetFamily)
    : rawBlocks;

  // 7. Per-stream block consistency validation
  let totalPayloadBytes = 0;
  const blocksToValidate = (targetFamily !== undefined) ? filteredBlocks : rawBlocks;

  if (errors.length === 0 && blocksToValidate.length > 0) {
    let expectedTotalBlocks: number | null = null;
    const seenBlockNumbers = new Set<number>();
    let hasInconsistentTotalBlocks = false;

    for (let i = 0; i < blocksToValidate.length; i++) {
      const b = blocksToValidate[i];
      totalPayloadBytes += b.payloadSize;

      // Check totalBlocks consistency
      if (expectedTotalBlocks === null) {
        expectedTotalBlocks = b.totalBlocks;
      } else if (expectedTotalBlocks !== b.totalBlocks && !hasInconsistentTotalBlocks) {
        errors.push(
          `Inconsistent totalBlocks values across blocks: first block had ${expectedTotalBlocks}, block ${i} specifies ${b.totalBlocks}`
        );
        hasInconsistentTotalBlocks = true;
      }

      // Check duplicate block numbers within same family stream
      if (seenBlockNumbers.has(b.blockNumber)) {
        errors.push(`Duplicate block number: block ${b.blockNumber} appears multiple times`);
      } else {
        seenBlockNumbers.add(b.blockNumber);
      }
    }

    // Check missing block numbers in sequence (0 to totalBlocks - 1)
    if (expectedTotalBlocks !== null && errors.length === 0) {
      if (blocksToValidate.length !== expectedTotalBlocks) {
        warnings.push(`Stream contains ${blocksToValidate.length} blocks, but header specifies totalBlocks=${expectedTotalBlocks}`);
      }
      const missingBlocks: number[] = [];
      for (let b = 0; b < expectedTotalBlocks; b++) {
        if (!seenBlockNumbers.has(b)) {
          missingBlocks.push(b);
        }
      }
      if (missingBlocks.length > 0) {
        errors.push(
          `Missing block numbers in sequence: ${missingBlocks.slice(0, 10).join(', ')}${missingBlocks.length > 10 ? `... (${missingBlocks.length} missing total)` : ''}`
        );
      }
    }
  }

  const primaryFamilyId = targetFamily !== undefined
    ? targetFamily
    : allFamilyIds.length === 1
      ? allFamilyIds[0]
      : null;

  return {
    valid: errors.length === 0,
    familyId: primaryFamilyId,
    allFamilyIds,
    blocks: blocksToValidate,
    errors,
    warnings,
    totalPayloadBytes,
  };
}

// ─── Dedicated RP2040 Validation Layer ───────────────────────────────────────────────

/**
 * Validates a parsed UF2 container against RP2040 silicon constraints,
 * memory destinations (Flash or SRAM), and physical flash boundaries.
 * 
 * Verifies:
 * - Family ID presence and exact match with RP2040_FAMILY_ID (0xE48BFF56)
 * - Target addresses fall within valid memory destinations (Flash or SRAM)
 * - Physical flash capacity bounds (configurable per board, default 2 MiB)
 * - Physical flash page boundary constraints (prevents 256-byte page wrapping)
 * - Overlapping or conflicting payload addresses across blocks
 */
export function validateRp2040UF2(
  parseResult: UF2ParseResult,
  boardConfig?: Rp2040BoardConfig
): Rp2040ValidationResult {
  const errors: string[] = [...parseResult.errors];
  const warnings: string[] = [...parseResult.warnings];

  if (!parseResult.valid) {
    return {
      valid: false,
      errors,
      warnings,
      minAddress: null,
      maxAddress: null,
      totalFirmwareBytes: 0,
      blockCount: parseResult.blocks.length,
      familyId: parseResult.familyId,
    };
  }

  // 1. Family ID validation
  if (parseResult.familyId === null) {
    if (parseResult.allFamilyIds.length === 0) {
      errors.push('RP2040 requires Family ID in UF2 flags (0x00002000), but no Family ID was present in blocks');
    } else {
      errors.push(`Multiple family IDs detected without target selection: ${parseResult.allFamilyIds.map(f => '0x' + f.toString(16)).join(', ')}`);
    }
  } else if (parseResult.familyId !== RP2040_FAMILY_ID) {
    errors.push(
      `Unsupported MCU family ID: 0x${parseResult.familyId.toString(16).toUpperCase()} (expected RP2040: 0x${RP2040_FAMILY_ID.toString(16).toUpperCase()})`
    );
  }

  const flashStart = boardConfig?.flashStart ?? RP2040_DEFAULT_FLASH_START;
  const flashSize  = boardConfig?.flashSize  ?? RP2040_DEFAULT_FLASH_SIZE;
  const flashEnd   = flashStart + flashSize;
  const pageSize   = boardConfig?.pageSize   ?? 256;
  const sramStart  = boardConfig?.sramStart  ?? RP2040_SRAM_START;
  const sramEnd    = sramStart + (boardConfig?.sramSize ?? RP2040_SRAM_SIZE);

  let minAddress = Infinity;
  let maxAddress = 0;
  let totalFirmwareBytes = 0;

  // Filter out non-main flash blocks if present
  const mainBlocks = parseResult.blocks.filter((b) => !b.isNotMainFlash);

  if (mainBlocks.length === 0) {
    errors.push('UF2 file contains no main flash firmware blocks');
  }

  // 2. Sort blocks by target address to detect overlaps and gaps
  const sortedBlocks = [...mainBlocks].sort((a, b) => a.targetAddress - b.targetAddress);

  for (let i = 0; i < sortedBlocks.length; i++) {
    const block = sortedBlocks[i];
    const target = block.targetAddress;
    const size = block.payloadSize;

    if (size === 0) {
      warnings.push(`Block ${block.blockNumber} has 0-byte payload size`);
      continue;
    }

    // 2.1 Memory Destination Validity Check
    const isFlash = target >= flashStart && target + size <= flashEnd;
    const isSram  = target >= sramStart  && target + size <= sramEnd;
    const isCustom = boardConfig?.allowedMemoryRegions?.some(
      (r) => target >= r.start && target + size <= r.end
    );

    if (!isFlash && !isSram && !isCustom) {
      if (target < flashStart) {
        errors.push(
          `Block ${block.blockNumber}: target address 0x${target.toString(16)} is below flash base 0x${flashStart.toString(16)} and outside SRAM`
        );
      } else {
        errors.push(
          `Block ${block.blockNumber}: address range [0x${target.toString(16)} - 0x${(target + size).toString(16)}) exceeds board flash capacity (max 0x${flashEnd.toString(16)})`
        );
      }
    }

    // 2.2 Word Alignment Check (recommended for ARM instruction / data integrity)
    const requireWord = boardConfig?.requireWordAlignment ?? true;
    if (requireWord && target % 4 !== 0) {
      warnings.push(`Block ${block.blockNumber}: target address 0x${target.toString(16)} is not 4-byte word aligned`);
    }

    // 2.3 Physical Flash Programming Constraints (only for Flash destinations)
    if (isFlash) {
      const pageOffset = target % pageSize;
      // Physical NOR flash programming commands cannot cross 256-byte page boundaries without page wrapping
      if (pageOffset + size > pageSize) {
        errors.push(
          `Block ${block.blockNumber}: payload range [0x${target.toString(16)} - 0x${(target + size).toString(16)}) crosses physical ${pageSize}-byte flash page boundary`
        );
      }
      if (boardConfig?.requireStrictPageAlignment && pageOffset !== 0) {
        errors.push(
          `Block ${block.blockNumber}: target address 0x${target.toString(16)} is not ${pageSize}-byte page aligned (strict alignment required)`
        );
      } else if (pageOffset !== 0) {
        warnings.push(
          `Block ${block.blockNumber}: target address 0x${target.toString(16)} has sub-page offset (+${pageOffset} bytes into ${pageSize}-byte page)`
        );
      }
    }

    // 2.4 Overlap and Duplicate Detection
    if (i > 0) {
      const prevBlock = sortedBlocks[i - 1];
      const prevEnd = prevBlock.targetAddress + prevBlock.payloadSize;

      if (target < prevEnd) {
        // Compare overlapping bytes to distinguish identical duplicate writes from corrupting conflicts
        const overlapStart = target;
        const overlapEnd = Math.min(prevEnd, target + size);
        let hasConflict = false;

        for (let addr = overlapStart; addr < overlapEnd; addr++) {
          const bytePrev = prevBlock.data[addr - prevBlock.targetAddress];
          const byteCurr = block.data[addr - block.targetAddress];
          if (bytePrev !== byteCurr) {
            hasConflict = true;
            break;
          }
        }

        errors.push(
          `Overlapping payload memory regions: block ${block.blockNumber} (0x${target.toString(16)}) overlaps with block ${prevBlock.blockNumber} (range ends at 0x${prevEnd.toString(16)})${hasConflict ? ' with conflicting data' : ''}`
        );
        if (!hasConflict) {
          warnings.push(
            `Block ${block.blockNumber} overlaps block ${prevBlock.blockNumber} with identical bytes (range [0x${overlapStart.toString(16)} - 0x${overlapEnd.toString(16)}))`
          );
        }
      }
    }

    minAddress = Math.min(minAddress, target);
    maxAddress = Math.max(maxAddress, target + size);
    totalFirmwareBytes += size;
  }

  const valid = errors.length === 0;

  return {
    valid,
    errors,
    warnings,
    minAddress: minAddress === Infinity ? null : minAddress,
    maxAddress: maxAddress === 0 ? null : maxAddress,
    totalFirmwareBytes,
    blockCount: mainBlocks.length,
    familyId: parseResult.familyId,
  };
}

// ─── Flash Memory Extraction Helper ──────────────────────────────────────────────────

/**
 * Extracts a continuous flash memory array from a validated RP2040 UF2 parse result.
 * Unprogrammed flash memory words are initialized to 0xFF (standard NOR flash erased state).
 * 
 * Bounds safety: allocations are bounded by boardConfig.flashSize (capped at 16 MiB max).
 */
export function extractRp2040FlashImage(
  parseResult: UF2ParseResult,
  boardConfig?: Rp2040BoardConfig,
  options?: ExtractFlashOptions
): Uint8Array {
  const validation = validateRp2040UF2(parseResult, boardConfig);
  if (!validation.valid) {
    throw new Error(`Cannot extract RP2040 flash image due to validation errors:\n- ${validation.errors.join('\n- ')}`);
  }

  const flashStart = boardConfig?.flashStart ?? RP2040_DEFAULT_FLASH_START;
  const configuredFlashSize = boardConfig?.flashSize ?? RP2040_DEFAULT_FLASH_SIZE;
  // Cap at 16 MiB maximum to prevent uncontrolled memory allocation
  const flashSize = Math.min(configuredFlashSize, 16 * 1024 * 1024);

  const mainBlocks = parseResult.blocks.filter(
    (b) => !b.isNotMainFlash && b.targetAddress >= flashStart && b.targetAddress < flashStart + flashSize
  );

  let allocSize = flashSize;
  if (options?.trimToFirmwareSize && validation.maxAddress !== null) {
    allocSize = Math.max(256, validation.maxAddress - flashStart);
  }

  const flash = new Uint8Array(allocSize).fill(0xff);

  for (const block of mainBlocks) {
    const offset = block.targetAddress - flashStart;
    if (offset >= 0 && offset + block.payloadSize <= allocSize) {
      flash.set(block.data.subarray(0, block.payloadSize), offset);
    }
  }

  return flash;
}

// ─── Vector Table Discovery & Validation ─────────────────────────────────────────────

/**
 * Discovers and validates the ARM Cortex-M0+ Vector Table within an extracted
 * flash memory image or candidate memory block.
 * 
 * Checks:
 * - Boot2 detection (first 256 bytes) and vector table offset (typically 0x10000100)
 * - Initial Stack Pointer (MSP) lies within RP2040 SRAM (0x20000000 - 0x20042000)
 * - Stack Pointer alignment (at least 4-byte aligned)
 * - Reset Handler points into executable memory (Flash, SRAM, Boot ROM)
 * - Reset Handler has Thumb bit set (bit 0 = 1)
 * - Entry instruction is not erased flash (0xFFFF)
 */
export function discoverAndValidateVectorTable(
  flashImage: Uint8Array,
  boardConfig?: Rp2040BoardConfig
): Rp2040VectorValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const flashStart = boardConfig?.flashStart ?? RP2040_DEFAULT_FLASH_START;
  const flashSize  = boardConfig?.flashSize  ?? RP2040_DEFAULT_FLASH_SIZE;
  const sramStart  = boardConfig?.sramStart  ?? RP2040_SRAM_START;
  const sramEnd    = sramStart + (boardConfig?.sramSize ?? RP2040_SRAM_SIZE);

  // Candidates for Vector Table location in order of preference
  const candidates: number[] = [];
  if (boardConfig?.vectorTableAddress !== undefined) {
    candidates.push(boardConfig.vectorTableAddress);
  }
  const defaultBoot2Vtor = flashStart + RP2040_DEFAULT_VECTOR_TABLE_OFFSET; // 0x10000100
  if (!candidates.includes(defaultBoot2Vtor)) candidates.push(defaultBoot2Vtor);
  if (!candidates.includes(flashStart)) candidates.push(flashStart);       // 0x10000000

  const view = new DataView(flashImage.buffer, flashImage.byteOffset, flashImage.byteLength);

  // Check if Boot2 is present in the first 256 bytes
  let hasBoot2 = false;
  let boot2Crc: number | undefined;
  if (flashImage.length >= 256) {
    const firstHalfword = view.getUint16(0, true);
    const crc = view.getUint32(252, true);
    // Boot2 typically starts with PUSH {LR} (0xB500..0xB503) or has non-erased CRC
    if ((firstHalfword & 0xff00) === 0xb500 || (crc !== 0xffffffff && crc !== 0x00000000)) {
      hasBoot2 = true;
      boot2Crc = crc;
    }
  }

  for (const vtor of candidates) {
    const offset = vtor - flashStart;
    if (offset < 0 || offset + 64 > flashImage.length) {
      continue;
    }

    const candidateErrors: string[] = [];
    const candidateWarnings: string[] = [];

    const initialSP          = view.getUint32(offset, true);
    const resetHandler       = view.getUint32(offset + 4, true);
    const nmiHandler         = view.getUint32(offset + 8, true);
    const hardFaultHandler   = view.getUint32(offset + 12, true);

    // If completely erased or zero, this offset does not contain a valid vector table
    if (initialSP === 0xffffffff || initialSP === 0x00000000) {
      continue;
    }

    // 1. Initial Stack Pointer Validation
    if (initialSP < sramStart || initialSP > sramEnd) {
      candidateErrors.push(
        `Initial Stack Pointer 0x${initialSP.toString(16)} is outside valid RP2040 SRAM range [0x${sramStart.toString(16)} - 0x${sramEnd.toString(16)}]`
      );
    }
    if (initialSP % 4 !== 0) {
      candidateErrors.push(
        `Initial Stack Pointer 0x${initialSP.toString(16)} is not 4-byte aligned`
      );
    } else if (initialSP % 8 !== 0) {
      candidateWarnings.push(
        `Initial Stack Pointer 0x${initialSP.toString(16)} is not 8-byte aligned (AAPCS recommended)`
      );
    }

    // 2. Reset Handler Validation
    const isThumb = (resetHandler & 1) === 1;
    if (!isThumb) {
      candidateErrors.push(
        `Reset Handler 0x${resetHandler.toString(16)} does not have Thumb bit set (ARM Cortex-M0+ requires bit 0 = 1)`
      );
    }

    const entryPC = resetHandler & ~1;
    const inFlash   = entryPC >= flashStart && entryPC < (flashStart + flashSize);
    const inSram    = entryPC >= sramStart  && entryPC < sramEnd;
    const inBootrom = entryPC >= RP2040_BOOTROM_START && entryPC < RP2040_BOOTROM_END;

    if (!inFlash && !inSram && !inBootrom) {
      candidateErrors.push(
        `Reset Handler entry PC 0x${entryPC.toString(16)} points outside executable memory`
      );
    } else if (inFlash) {
      const pcOffset = entryPC - flashStart;
      if (pcOffset + 2 <= flashImage.length) {
        const firstOpcode = view.getUint16(pcOffset, true);
        if (firstOpcode === 0xffff) {
          candidateErrors.push(
            `Reset Handler entry PC 0x${entryPC.toString(16)} points to erased flash (0xFFFF)`
          );
        }
      }
    }

    // 3. Exception vector validation
    if (nmiHandler !== 0 && (nmiHandler & 1) !== 1) {
      candidateWarnings.push(`NMI handler 0x${nmiHandler.toString(16)} lacks Thumb bit`);
    }
    if (hardFaultHandler !== 0 && (hardFaultHandler & 1) !== 1) {
      candidateWarnings.push(`HardFault handler 0x${hardFaultHandler.toString(16)} lacks Thumb bit`);
    }

    if (candidateErrors.length === 0) {
      return {
        valid: true,
        vectorTable: {
          address: vtor,
          initialSP,
          resetHandler,
          nmiHandler,
          hardFaultHandler,
          svCallHandler: view.getUint32(offset + 44, true),
          pendSVHandler: view.getUint32(offset + 56, true),
          sysTickHandler: view.getUint32(offset + 60, true),
          isThumb,
          entryPC,
          hasBoot2,
          boot2Crc,
        },
        errors: [],
        warnings: [...warnings, ...candidateWarnings],
      };
    } else {
      errors.push(`Candidate vector table at 0x${vtor.toString(16)} failed:\n  - ${candidateErrors.join('\n  - ')}`);
    }
  }

  if (errors.length === 0) {
    errors.push('No valid RP2040 Cortex-M0+ vector table found in firmware image');
  }

  return {
    valid: false,
    vectorTable: null,
    errors,
    warnings,
  };
}
