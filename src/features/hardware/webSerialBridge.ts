/**
 * Voltforge WebSerial Hardware Bridge
 * Enables direct in-browser flashing and real-time serial terminal communication with physical microcontrollers.
 */

export interface SerialConnectionOptions {
  baudRate: number;
  dataBits?: 7 | 8;
  stopBits?: 1 | 2;
  parity?: 'none' | 'even' | 'odd';
}

export class WebSerialBridge {
  private port: any = null;
  private reader: any = null;
  private writer: any = null;
  private isReading = false;

  /**
   * Check if browser supports WebSerial API.
   */
  static isSupported(): boolean {
    return typeof navigator !== 'undefined' && 'serial' in navigator;
  }

  /**
   * Prompt user to choose a USB/Serial COM port.
   */
  async requestPort(): Promise<boolean> {
    if (!WebSerialBridge.isSupported()) {
      throw new Error('WebSerial API is not supported in this browser. Please use Chrome, Edge, or Opera.');
    }
    try {
      this.port = await (navigator as any).serial.requestPort();
      return Boolean(this.port);
    } catch (err: any) {
      if (err.name === 'NotFoundError') {
        return false; // User cancelled prompt
      }
      throw err;
    }
  }

  /**
   * Open the serial connection with specified baud rate.
   */
  async connect(options: SerialConnectionOptions = { baudRate: 115200 }): Promise<void> {
    if (!this.port) {
      const selected = await this.requestPort();
      if (!selected) throw new Error('No serial port selected.');
    }

    await this.port.open({
      baudRate: options.baudRate,
      dataBits: options.dataBits || 8,
      stopBits: options.stopBits || 1,
      parity: options.parity || 'none',
    });

    this.writer = this.port.writable.getWriter();
  }

  /**
   * Start streaming incoming serial data to a callback.
   */
  async startReading(onData: (text: string) => void): Promise<void> {
    if (!this.port || !this.port.readable) return;
    this.isReading = true;
    const textDecoder = new TextDecoderStream();
    this.port.readable.pipeTo(textDecoder.writable);
    this.reader = textDecoder.readable.getReader();

    try {
      while (this.isReading) {
        const { value, done } = await this.reader.read();
        if (done) break;
        if (value) onData(value);
      }
    } catch (err) {
      console.warn('[WebSerial] Read stream closed or interrupted:', err);
    } finally {
      this.reader?.releaseLock();
    }
  }

  /**
   * Send data over serial to the board.
   */
  async write(data: string | Uint8Array): Promise<void> {
    if (!this.writer) throw new Error('Serial writer not connected.');
    if (typeof data === 'string') {
      const encoder = new TextEncoder();
      await this.writer.write(encoder.encode(data));
    } else {
      await this.writer.write(data);
    }
  }

  /**
   * Flash a compiled binary/hex buffer to the physical microcontroller with progress tracking.
   */
  async flashFirmware(
    hexBuffer: Uint8Array,
    onProgress?: (percent: number) => void
  ): Promise<boolean> {
    if (!this.writer) throw new Error('Serial port not open for flashing.');

    const chunkSize = 256;
    const totalChunks = Math.ceil(hexBuffer.length / chunkSize);

    for (let i = 0; i < totalChunks; i++) {
      const start = i * chunkSize;
      const end = Math.min(start + chunkSize, hexBuffer.length);
      const chunk = hexBuffer.slice(start, end);
      await this.writer.write(chunk);

      if (onProgress) {
        onProgress(Math.round(((i + 1) / totalChunks) * 100));
      }
    }

    return true;
  }

  /**
   * Disconnect and release serial port.
   */
  async disconnect(): Promise<void> {
    this.isReading = false;
    try {
      if (this.reader) await this.reader.cancel();
      if (this.writer) await this.writer.close();
      if (this.port) await this.port.close();
    } catch (err) {
      console.warn('[WebSerial] Disconnect cleanup warning:', err);
    } finally {
      this.port = null;
      this.reader = null;
      this.writer = null;
    }
  }
}
