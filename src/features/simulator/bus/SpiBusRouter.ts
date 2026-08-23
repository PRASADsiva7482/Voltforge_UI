// ═══════════════════════════════════════════════════════════════════════════
// VoltForge — Cross-Board & Peripheral SPI Signal Router
// ═══════════════════════════════════════════════════════════════════════════

export interface SpiSlaveDevice {
  chipSelectPinId: string;
  transferByte: (byte: number) => number;
}

export class SpiBusRouter {
  private static instance: SpiBusRouter | null = null;
  private slaves: Map<string, SpiSlaveDevice> = new Map();

  public static getInstance(): SpiBusRouter {
    if (!SpiBusRouter.instance) {
      SpiBusRouter.instance = new SpiBusRouter();
    }
    return SpiBusRouter.instance;
  }

  public registerSlave(deviceId: string, device: SpiSlaveDevice): void {
    this.slaves.set(deviceId, device);
  }

  public unregisterSlave(deviceId: string): void {
    this.slaves.delete(deviceId);
  }

  public transfer(csPinId: string, byteOut: number): number {
    for (const device of this.slaves.values()) {
      if (device.chipSelectPinId === csPinId) {
        return device.transferByte(byteOut);
      }
    }
    return 0xFF;
  }
}
