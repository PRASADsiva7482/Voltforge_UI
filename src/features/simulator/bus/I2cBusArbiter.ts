// ═══════════════════════════════════════════════════════════════════════════
// VoltForge — I2C Multi-Device Bus Arbiter
// ═══════════════════════════════════════════════════════════════════════════

export interface I2cDeviceListener {
  address: number;
  onReceive: (bytes: number[]) => void;
  onRequest: () => number[];
}

export class I2cBusArbiter {
  private static instance: I2cBusArbiter | null = null;
  private devices: Map<number, I2cDeviceListener> = new Map();
  private busLogs: Array<{ timestamp: string; addr: string; mode: 'READ' | 'WRITE'; data: string; ack: boolean }> = [];

  public static getInstance(): I2cBusArbiter {
    if (!I2cBusArbiter.instance) {
      I2cBusArbiter.instance = new I2cBusArbiter();
    }
    return I2cBusArbiter.instance;
  }

  public registerSlave(device: I2cDeviceListener): void {
    this.devices.set(device.address, device);
  }

  public unregisterSlave(address: number): void {
    this.devices.delete(address);
  }

  public writeTransaction(address: number, data: number[]): boolean {
    const slave = this.devices.get(address);
    const ack = Boolean(slave);

    this.busLogs.push({
      timestamp: new Date().toLocaleTimeString(),
      addr: `0x${address.toString(16).toUpperCase().padStart(2, '0')}`,
      mode: 'WRITE',
      data: data.map((b) => `0x${b.toString(16).padStart(2, '0')}`).join(' '),
      ack,
    });
    if (this.busLogs.length > 100) this.busLogs.shift();

    if (slave) {
      slave.onReceive(data);
      return true;
    }
    return false;
  }

  public readTransaction(address: number, quantity: number): number[] {
    const slave = this.devices.get(address);
    const ack = Boolean(slave);
    const result = slave ? slave.onRequest().slice(0, quantity) : Array(quantity).fill(0xFF);

    this.busLogs.push({
      timestamp: new Date().toLocaleTimeString(),
      addr: `0x${address.toString(16).toUpperCase().padStart(2, '0')}`,
      mode: 'READ',
      data: result.map((b) => `0x${b.toString(16).padStart(2, '0')}`).join(' '),
      ack,
    });
    if (this.busLogs.length > 100) this.busLogs.shift();

    return result;
  }

  public getLogs() {
    return [...this.busLogs];
  }
}
