// ═══════════════════════════════════════════════════════════════════════════
// VoltForge — Virtual IoT Network Stack (WiFi & HTTP Client Emulation)
// ═══════════════════════════════════════════════════════════════════════════

export interface NetworkLogEntry {
  id: string;
  timestamp: string;
  type: 'WIFI' | 'HTTP' | 'MQTT';
  direction: 'IN' | 'OUT' | 'STATUS';
  summary: string;
  details?: Record<string, unknown> | string;
}

export type NetworkEventCallback = (entry: NetworkLogEntry) => void;

export class VirtualNetworkStack {
  private static instance: VirtualNetworkStack | null = null;
  private isConnected = false;
  private ssid = '';
  private ipAddress = '192.168.4.101';
  private gateway = '192.168.4.1';
  private subnet = '255.255.255.0';
  private dns = '8.8.8.8';
  private macAddress = '24:0A:C4:B8:1E:92';
  private rssi = -58; // dBm
  private listeners: Set<NetworkEventCallback> = new Set();
  private logs: NetworkLogEntry[] = [];

  public static getInstance(): VirtualNetworkStack {
    if (!VirtualNetworkStack.instance) {
      VirtualNetworkStack.instance = new VirtualNetworkStack();
    }
    return VirtualNetworkStack.instance;
  }

  public subscribe(cb: NetworkEventCallback): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  public getLogs(): NetworkLogEntry[] {
    return [...this.logs];
  }

  public clearLogs(): void {
    this.logs = [];
  }

  private emit(type: 'WIFI' | 'HTTP' | 'MQTT', direction: 'IN' | 'OUT' | 'STATUS', summary: string, details?: any) {
    const entry: NetworkLogEntry = {
      id: `net_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      timestamp: new Date().toLocaleTimeString(),
      type,
      direction,
      summary,
      details,
    };
    this.logs.push(entry);
    if (this.logs.length > 200) this.logs.shift();
    this.listeners.forEach((cb) => cb(entry));
  }

  // ── WiFi Emulation ──
  public connectWiFi(ssid: string, password?: string): boolean {
    this.ssid = ssid || 'VoltForge-Guest';
    this.isConnected = true;
    this.emit('WIFI', 'STATUS', `Connected to SSID "${this.ssid}"`, {
      ip: this.ipAddress,
      gateway: this.gateway,
      mac: this.macAddress,
      rssi: `${this.rssi} dBm`,
      security: password ? 'WPA2-PSK' : 'Open',
    });
    return true;
  }

  public disconnectWiFi(): void {
    if (this.isConnected) {
      this.emit('WIFI', 'STATUS', `Disconnected from SSID "${this.ssid}"`);
    }
    this.isConnected = false;
    this.ssid = '';
  }

  public getStatus(): {
    connected: boolean;
    ssid: string;
    ip: string;
    gateway: string;
    subnet: string;
    dns: string;
    mac: string;
    rssi: number;
  } {
    return {
      connected: this.isConnected,
      ssid: this.ssid,
      ip: this.isConnected ? this.ipAddress : '0.0.0.0',
      gateway: this.isConnected ? this.gateway : '0.0.0.0',
      subnet: this.isConnected ? this.subnet : '0.0.0.0',
      dns: this.isConnected ? this.dns : '0.0.0.0',
      mac: this.macAddress,
      rssi: this.isConnected ? this.rssi : 0,
    };
  }

  // ── HTTP Client Emulation ──
  public async httpGet(url: string, headers?: Record<string, string>): Promise<{ status: number; body: string }> {
    this.emit('HTTP', 'OUT', `GET ${url}`, { headers });
    try {
      // In browser simulation, simulate responses or fetch with timeout
      this.emit('HTTP', 'IN', `HTTP 200 OK for GET ${url}`, {
        response: '{"status":"ok","simulated":true,"timestamp":' + Date.now() + '}',
      });
      return {
        status: 200,
        body: JSON.stringify({ status: 'ok', url, simulated: true, timestamp: Date.now() }),
      };
    } catch (err: any) {
      this.emit('HTTP', 'IN', `HTTP Error: ${err.message}`, { url });
      return { status: 500, body: err.message };
    }
  }

  public async httpPost(url: string, payload: string, headers?: Record<string, string>): Promise<{ status: number; body: string }> {
    this.emit('HTTP', 'OUT', `POST ${url}`, { payload, headers });
    this.emit('HTTP', 'IN', `HTTP 200 OK for POST ${url}`, {
      status: 'acknowledged',
      receivedBytes: payload.length,
    });
    return {
      status: 200,
      body: JSON.stringify({ status: 'acknowledged', receivedBytes: payload.length, timestamp: Date.now() }),
    };
  }
}
