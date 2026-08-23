// ═══════════════════════════════════════════════════════════════════════════
// VoltForge — Cross-Board UART Signal Router
// ═══════════════════════════════════════════════════════════════════════════

export interface UartEndpoint {
  boardId: string;
  baudRate: number;
  onReceive: (data: string) => void;
}

export class UartBusRouter {
  private static instance: UartBusRouter | null = null;
  private endpoints: Map<string, UartEndpoint> = new Map();
  private links: Map<string, string> = new Map(); // fromBoardId -> toBoardId
  private logs: Array<{ timestamp: string; from: string; to: string; text: string }> = [];

  public static getInstance(): UartBusRouter {
    if (!UartBusRouter.instance) {
      UartBusRouter.instance = new UartBusRouter();
    }
    return UartBusRouter.instance;
  }

  public registerEndpoint(endpoint: UartEndpoint): void {
    this.endpoints.set(endpoint.boardId, endpoint);
  }

  public unregisterEndpoint(boardId: string): void {
    this.endpoints.delete(boardId);
    this.links.delete(boardId);
  }

  public linkBoards(fromBoardId: string, toBoardId: string): void {
    this.links.set(fromBoardId, toBoardId);
  }

  public transmit(fromBoardId: string, data: string): void {
    const targetBoardId = this.links.get(fromBoardId);
    if (!targetBoardId) return;

    const target = this.endpoints.get(targetBoardId);
    if (target) {
      this.logs.push({
        timestamp: new Date().toLocaleTimeString(),
        from: fromBoardId,
        to: targetBoardId,
        text: data,
      });
      if (this.logs.length > 100) this.logs.shift();

      target.onReceive(data);
    }
  }

  public getLogs() {
    return [...this.logs];
  }
}
