// ═══════════════════════════════════════════════════════════════════════════
// VoltForge — Virtual MQTT Cloud Bridge (PubSubClient Emulation)
// ═══════════════════════════════════════════════════════════════════════════

import { VirtualNetworkStack } from './VirtualNetworkStack';

export interface MqttMessage {
  id: string;
  topic: string;
  payload: string;
  timestamp: string;
  qos?: number;
  retained?: boolean;
  direction: 'PUBLISHED' | 'RECEIVED';
}

export class MqttBridge {
  private static instance: MqttBridge | null = null;
  private broker = 'broker.hivemq.com';
  private port = 8884;
  private clientId = 'voltforge_esp32_device';
  private isConnected = false;
  private subscriptions: Set<string> = new Set();
  private messageHistory: MqttMessage[] = [];
  private messageCallback: ((topic: string, payload: string) => void) | null = null;
  private network = VirtualNetworkStack.getInstance();
  private ws: WebSocket | null = null;

  public static getInstance(): MqttBridge {
    if (!MqttBridge.instance) {
      MqttBridge.instance = new MqttBridge();
    }
    return MqttBridge.instance;
  }

  public setServer(broker: string, port = 1883): void {
    this.broker = broker;
    this.port = port;
  }

  public connect(clientId = 'voltforge_client', _user?: string, _pass?: string): boolean {
    this.clientId = clientId;
    this.isConnected = true;

    // Log connection event
    (this.network as any).emit('MQTT', 'STATUS', `Connected to MQTT broker ${this.broker}:${this.port}`, {
      clientId: this.clientId,
      protocol: 'MQTT 3.1.1',
      cleanSession: true,
    });

    return true;
  }

  public disconnect(): void {
    if (this.isConnected) {
      (this.network as any).emit('MQTT', 'STATUS', `Disconnected from MQTT broker ${this.broker}`);
    }
    this.isConnected = false;
    this.subscriptions.clear();
  }

  public connected(): boolean {
    return this.isConnected;
  }

  public publish(topic: string, payload: string, retained = false): boolean {
    if (!this.isConnected) return false;

    const msg: MqttMessage = {
      id: `pub_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      topic,
      payload,
      timestamp: new Date().toLocaleTimeString(),
      qos: 0,
      retained,
      direction: 'PUBLISHED',
    };

    this.messageHistory.push(msg);
    if (this.messageHistory.length > 200) this.messageHistory.shift();

    (this.network as any).emit('MQTT', 'OUT', `PUB "${topic}": ${payload}`, {
      topic,
      payload,
      length: payload.length,
      retained,
    });

    // The simulator is an in-process broker. A published packet must reach
    // subscribed virtual clients immediately; otherwise PubSubClient sketches
    // can publish successfully while subscribers never observe the message.
    this.receiveIncoming(topic, payload);

    return true;
  }

  public subscribe(topic: string): boolean {
    if (!this.isConnected) return false;
    this.subscriptions.add(topic);

    (this.network as any).emit('MQTT', 'STATUS', `SUB topic "${topic}"`, {
      topic,
      qos: 0,
    });

    return true;
  }

  public unsubscribe(topic: string): boolean {
    this.subscriptions.delete(topic);
    (this.network as any).emit('MQTT', 'STATUS', `UNSUB topic "${topic}"`);
    return true;
  }

  public setCallback(callback: (topic: string, payload: string) => void): void {
    this.messageCallback = callback;
  }

  public loop(): boolean {
    return this.isConnected;
  }

  /**
   * Simulate or trigger an incoming message from the cloud broker
   */
  public receiveIncoming(topic: string, payload: string): void {
    const isSubscribed = Array.from(this.subscriptions).some((sub) => {
      if (sub === topic || sub === '#' || sub === '+') return true;
      if (sub.endsWith('/#')) {
        const prefix = sub.slice(0, -2);
        return topic.startsWith(prefix);
      }
      return false;
    });

    if (!isSubscribed) return;

    const msg: MqttMessage = {
      id: `rec_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      topic,
      payload,
      timestamp: new Date().toLocaleTimeString(),
      qos: 0,
      direction: 'RECEIVED',
    };

    this.messageHistory.push(msg);
    if (this.messageHistory.length > 200) this.messageHistory.shift();

    (this.network as any).emit('MQTT', 'IN', `REC "${topic}": ${payload}`, { topic, payload });

    if (this.messageCallback) {
      this.messageCallback(topic, payload);
    }
  }

  public getMessages(): MqttMessage[] {
    return [...this.messageHistory];
  }

  public getSubscriptions(): string[] {
    return Array.from(this.subscriptions);
  }

  public getStatus() {
    return {
      connected: this.isConnected,
      broker: this.broker,
      port: this.port,
      clientId: this.clientId,
      subscribedTopics: Array.from(this.subscriptions),
    };
  }
}
