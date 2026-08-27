export interface LogicCaptureFrame {
  timestamp_s: number;
  channels: Record<string, number>;
}

export interface I2cDecodedEvent {
  kind: 'START' | 'STOP' | 'BYTE';
  timestamp_s: number;
  value?: number;
  address?: number;
  read?: boolean;
  ack?: boolean;
  tenBit?: boolean;
}

export interface SpiDecodedFrame {
  timestamp_s: number;
  mosi: number;
  miso: number;
  bits: number;
}

export interface UartDecodedFrame {
  timestamp_s: number;
  value: number;
  text: string;
  framingValid: boolean;
}

export interface LogicAnalysis {
  i2c: I2cDecodedEvent[];
  spi: SpiDecodedFrame[];
  uart: UartDecodedFrame[];
}

const DEFAULT_LOGIC_THRESHOLD_V = 2.5;
const MAX_DECODED_EVENTS = 64;

function digitalValue(frame: LogicCaptureFrame, channel: string, threshold: number): boolean {
  return (frame.channels[channel] ?? 0) >= threshold;
}

function pushLimited<T>(items: T[], item: T): void {
  items.push(item);
  if (items.length > MAX_DECODED_EVENTS) items.shift();
}

/** Decode I²C from sampled SDA/SCL channels. Supports normal and 10-bit address headers. */
export function decodeI2c(
  frames: LogicCaptureFrame[],
  sdaChannel?: string,
  sclChannel?: string,
  threshold = DEFAULT_LOGIC_THRESHOLD_V,
): I2cDecodedEvent[] {
  if (!sdaChannel || !sclChannel || sdaChannel === sclChannel || frames.length < 2) return [];

  const events: I2cDecodedEvent[] = [];
  let previousSda = digitalValue(frames[0], sdaChannel, threshold);
  let previousScl = digitalValue(frames[0], sclChannel, threshold);
  let active = false;
  let bits: boolean[] = [];
  let tenBitPrefix: number | undefined;

  for (let index = 1; index < frames.length; index += 1) {
    const frame = frames[index];
    const sda = digitalValue(frame, sdaChannel, threshold);
    const scl = digitalValue(frame, sclChannel, threshold);

    if (previousSda && !sda && scl) {
      active = true;
      bits = [];
      tenBitPrefix = undefined;
      pushLimited(events, { kind: 'START', timestamp_s: frame.timestamp_s });
    } else if (active && !previousSda && sda && scl) {
      active = false;
      bits = [];
      tenBitPrefix = undefined;
      pushLimited(events, { kind: 'STOP', timestamp_s: frame.timestamp_s });
    }

    if (active && !previousScl && scl) {
      bits.push(sda);
      if (bits.length === 9) {
        const value = bits.slice(0, 8).reduce((byte, bit) => (byte << 1) | (bit ? 1 : 0), 0);
        const ack = !bits[8];
        const isTenBitHeader = (value & 0xf8) === 0xf0 && ((value >> 1) & 0x03) === 0x00;
        if (events[events.length - 1]?.kind === 'START' && isTenBitHeader) {
          tenBitPrefix = (value & 0x06) << 7;
        }
        const previousByte = events[events.length - 1];
        const address = previousByte?.kind === 'START' && !isTenBitHeader
          ? value >> 1
          : tenBitPrefix !== undefined && previousByte?.kind === 'BYTE'
            ? tenBitPrefix | value
            : undefined;
        pushLimited(events, {
          kind: 'BYTE',
          timestamp_s: frame.timestamp_s,
          value,
          address,
          read: previousByte?.kind === 'START' && !isTenBitHeader ? Boolean(value & 1) : undefined,
          ack,
          tenBit: isTenBitHeader || tenBitPrefix !== undefined,
        });
        bits = [];
      }
    }

    previousSda = sda;
    previousScl = scl;
  }

  return events;
}

function spiSampleEdge(mode: 0 | 1 | 2 | 3, previousClock: boolean, clock: boolean): boolean {
  const rising = !previousClock && clock;
  const falling = previousClock && !clock;
  const leading = mode === 0 || mode === 1 ? rising : falling;
  const trailing = mode === 0 || mode === 1 ? falling : rising;
  return mode === 0 || mode === 2 ? leading : trailing;
}

/** Decode SPI frames. CS is active low; mode and bit order are configurable. */
export function decodeSpi(
  frames: LogicCaptureFrame[],
  mosiChannel?: string,
  misoChannel?: string,
  clockChannel?: string,
  chipSelectChannel?: string,
  mode: 0 | 1 | 2 | 3 = 0,
  lsbFirst = false,
  threshold = DEFAULT_LOGIC_THRESHOLD_V,
): SpiDecodedFrame[] {
  if (!mosiChannel || !misoChannel || !clockChannel || !chipSelectChannel || frames.length < 2) return [];
  const decoded: SpiDecodedFrame[] = [];
  let previousClock = digitalValue(frames[0], clockChannel, threshold);
  let mosiBits: number[] = [];
  let misoBits: number[] = [];

  const toByte = (bits: number[]) => bits.reduce((value, bit, bitIndex) => {
    const shift = lsbFirst ? bitIndex : 7 - bitIndex;
    return value | ((bit & 1) << shift);
  }, 0);

  for (let index = 1; index < frames.length; index += 1) {
    const frame = frames[index];
    const selected = !digitalValue(frame, chipSelectChannel, threshold);
    const clock = digitalValue(frame, clockChannel, threshold);
    if (!selected) {
      mosiBits = [];
      misoBits = [];
    } else if (spiSampleEdge(mode, previousClock, clock)) {
      mosiBits.push(digitalValue(frame, mosiChannel, threshold) ? 1 : 0);
      misoBits.push(digitalValue(frame, misoChannel, threshold) ? 1 : 0);
      if (mosiBits.length === 8) {
        pushLimited(decoded, {
          timestamp_s: frame.timestamp_s,
          mosi: toByte(mosiBits),
          miso: toByte(misoBits),
          bits: 8,
        });
        mosiBits = [];
        misoBits = [];
      }
    }
    previousClock = clock;
  }
  return decoded;
}

/** Decode 8N1 UART frames from a sampled TX/RX channel. */
export function decodeUart(
  frames: LogicCaptureFrame[],
  channel?: string,
  baudRate = 9600,
  threshold = DEFAULT_LOGIC_THRESHOLD_V,
): UartDecodedFrame[] {
  if (!channel || frames.length < 2 || baudRate <= 0) return [];
  const decoded: UartDecodedFrame[] = [];
  const bitTime = 1 / baudRate;
  const levelAt = (time: number): boolean => {
    let nearest = frames[0];
    for (const frame of frames) {
      if (Math.abs(frame.timestamp_s - time) < Math.abs(nearest.timestamp_s - time)) nearest = frame;
      if (frame.timestamp_s > time && nearest !== frames[0]) break;
    }
    return digitalValue(nearest, channel, threshold);
  };

  for (let index = 1; index < frames.length; index += 1) {
    const previous = digitalValue(frames[index - 1], channel, threshold);
    const current = digitalValue(frames[index], channel, threshold);
    if (!previous || current || frames[index].timestamp_s <= frames[index - 1].timestamp_s) continue;

    const start = frames[index].timestamp_s;
    const bits = Array.from({ length: 8 }, (_, bit) => (levelAt(start + bitTime * (1.5 + bit)) ? 1 : 0));
    const value = bits.reduce<number>((byte, bit, bitIndex) => byte | (bit << bitIndex), 0);
    const stop = levelAt(start + bitTime * 9.5);
    pushLimited(decoded, {
      timestamp_s: start,
      value,
      text: value >= 32 && value <= 126 ? String.fromCharCode(value) : '.',
      framingValid: stop,
    });

    // Ignore transitions inside the frame that was just decoded. Leave the
    // stop-bit edge available so a back-to-back frame can start immediately.
    const stopSampleTime = start + bitTime * 9.5;
    while (
      index + 1 < frames.length &&
      frames[index + 1].timestamp_s < stopSampleTime
    ) {
      index += 1;
    }
  }
  return decoded;
}

export function analyzeProtocols(
  frames: LogicCaptureFrame[],
  channels: string[],
  baudRate = 9600,
): LogicAnalysis {
  const find = (pattern: RegExp, fallbackIndex: number) =>
    channels.find((channel) => pattern.test(channel.toLowerCase())) || channels[fallbackIndex];
  return {
    i2c: decodeI2c(frames, find(/sda|data/, 0), find(/scl|clock/, 1)),
    spi: decodeSpi(frames, find(/mosi|tx/, 0), find(/miso|rx/, 1), find(/sck|clk|clock/, 2), find(/cs|ss|select/, 3)),
    uart: decodeUart(frames, find(/uart|tx|rx|serial/, 0), baudRate),
  };
}
