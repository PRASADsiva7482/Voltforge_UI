import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../auth/useAuth';
import keycloak from '../auth/keycloak';
import { useCanvasStore } from '../store/canvasStore';
import { usePcbStore, type PcbLayout } from '../store/pcbStore';
import type { CanvasNode, Wire } from '../types/domain';

export interface CollaboratorInfo {
  color: string;
  displayName: string;
  lastSeen: number;
  userId: string;
  x: number;
  y: number;
}

const COLLABORATOR_COLORS = [
  '#38bdf8',
  '#4ade80',
  '#facc15',
  '#c084fc',
  '#f87171',
  '#fb923c',
];

const CURSOR_THROTTLE_MS = 50;
const CANVAS_SYNC_DEBOUNCE_MS = 180;
const STALE_CURSOR_MS = 10_000;
const MAX_RECONNECT_DELAY_MS = 12_000;

function resolveNativeWsUrl(): string {
  const explicit = import.meta.env.VITE_WS_BASE_URL as string | undefined;
  if (explicit) return explicit;

  const apiBase =
    import.meta.env.VITE_API_BASE_URL ||
    (import.meta.env.DEV
      ? 'http://localhost:2001/voltForge-app/api/v1'
      : `${window.location.origin}/voltForge-app/api/v1`);

  const url = new URL(apiBase, window.location.origin);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  if (/\/api\/v1\/?$/.test(url.pathname)) {
    url.pathname = url.pathname.replace(/\/api\/v1\/?$/, '/ws-native');
  } else {
    url.pathname = `${url.pathname.replace(/\/$/, '')}/ws-native`;
  }
  return url.toString();
}

function buildStompFrame(command: string, headers: Record<string, string>, body?: unknown): string {
  const headerLines = Object.entries(headers).map(([key, value]) => `${key}:${value}`);
  const payload = body === undefined ? '' : JSON.stringify(body);
  return `${command}\n${headerLines.join('\n')}\n\n${payload}\0`;
}

function readStompBodies(rawFrame: string): Array<{ command: string; body: string }> {
  return rawFrame
    .split('\0')
    .map((frame) => frame.trim())
    .filter(Boolean)
    .map((frame) => {
      const bodyStart = frame.indexOf('\n\n');
      return {
        command: frame.slice(0, frame.indexOf('\n')).trim(),
        body: bodyStart === -1 ? '' : frame.slice(bodyStart + 2).trim(),
      };
    });
}

export function useCollaboration(projectId: string) {
  const { user } = useAuth();
  const [isConnected, setIsConnected] = useState(false);
  const [activeUsers, setActiveUsers] = useState<Record<string, CollaboratorInfo>>({});

  const wsRef = useRef<WebSocket | null>(null);
  const isRemoteSyncing = useRef(false);
  const lastCursorAt = useRef(0);
  const heartbeatRef = useRef<number | null>(null);
  const canvasSyncTimer = useRef<number | null>(null);
  const reconnectTimer = useRef<number | null>(null);
  const reconnectBlocked = useRef(false);
  const reconnectAttempts = useRef(0);
  const pendingCanvasSync = useRef<{
    nodes: CanvasNode[];
    wires: Wire[];
    viewport?: { x: number; y: number; scale: number };
    pcbLayout?: PcbLayout;
  } | null>(null);
  const lastCanvasPayload = useRef<string>('');
  const userColor = useRef(COLLABORATOR_COLORS[Math.floor(Math.random() * COLLABORATOR_COLORS.length)]);

  const loadCanvas = useCanvasStore((s) => s.loadCanvas);
  const loadPcb = usePcbStore((s) => s.loadPcb);

  const currentUserId = user?.keycloakId || 'anon';
  const displayName = user?.displayName || user?.username || 'Collaborator';

  const sendFrame = useCallback((command: string, headers: Record<string, string>, body?: unknown) => {
    const socket = wsRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) return false;
    socket.send(buildStompFrame(command, headers, body));
    return true;
  }, []);

  const subscribeToProject = useCallback(() => {
    sendFrame('SUBSCRIBE', {
      id: `sub-canvas-${projectId}`,
      destination: `/topic/project/${projectId}/canvas`,
    });
    sendFrame('SUBSCRIBE', {
      id: `sub-cursors-${projectId}`,
      destination: `/topic/project/${projectId}/cursors`,
    });
  }, [projectId, sendFrame]);

  useEffect(() => {
    if (!projectId) return;

    let disposed = false;
    reconnectBlocked.current = false;

    const clearHeartbeat = () => {
      if (heartbeatRef.current) {
        window.clearInterval(heartbeatRef.current);
        heartbeatRef.current = null;
      }
    };

    const scheduleReconnect = () => {
      if (disposed || reconnectBlocked.current || reconnectTimer.current) return;
      const delay = Math.min(1000 * 2 ** reconnectAttempts.current, MAX_RECONNECT_DELAY_MS);
      reconnectAttempts.current += 1;
      reconnectTimer.current = window.setTimeout(() => {
        reconnectTimer.current = null;
        connect();
      }, delay);
    };

    const connect = () => {
      const socket = new WebSocket(resolveNativeWsUrl());
      wsRef.current = socket;

      socket.onopen = async () => {
        if (keycloak.token) {
          await keycloak.updateToken(30).catch(() => undefined);
        }

        const connectHeaders: Record<string, string> = {
          'accept-version': '1.2,1.1,1.0',
          'heart-beat': '10000,10000',
        };

        if (keycloak.token) {
          connectHeaders.Authorization = `Bearer ${keycloak.token}`;
        }

        sendFrame('CONNECT', connectHeaders);
      };

      socket.onmessage = (event) => {
        const raw = event.data as string;
        if (!raw || raw === '\n') return;

        for (const frame of readStompBodies(raw)) {
          if (frame.command === 'CONNECTED') {
            reconnectAttempts.current = 0;
            setIsConnected(true);
            subscribeToProject();
            clearHeartbeat();
            heartbeatRef.current = window.setInterval(() => socket.send('\n'), 20_000);
            continue;
          }

          if (frame.command === 'ERROR') {
            // A STOMP ERROR is a protocol/application rejection (for example
            // edit access denied), not a transient network disconnect. Do not
            // immediately reconnect and make the editor header flap forever.
            reconnectBlocked.current = true;
            setIsConnected(false);
            socket.close();
            continue;
          }

          if (frame.command !== 'MESSAGE' || !frame.body) continue;

          try {
            const data = JSON.parse(frame.body);

            if (data.userId && data.x !== undefined && data.y !== undefined) {
              if (data.userId !== currentUserId) {
                setActiveUsers((prev) => ({
                  ...prev,
                  [data.userId]: {
                    color: data.color || '#38bdf8',
                    displayName: data.displayName || 'Collaborator',
                    lastSeen: Date.now(),
                    userId: data.userId,
                    x: Number(data.x),
                    y: Number(data.y),
                  },
                }));
              }
            }

            if (data.eventType === 'CANVAS_SYNC' && data.payload && data.userId !== currentUserId) {
              isRemoteSyncing.current = true;
              loadCanvas(data.payload.nodes || [], data.payload.wires || [], data.payload.viewport);
              if (data.payload.pcbLayout) {
                loadPcb(data.payload.pcbLayout);
              }
              window.setTimeout(() => {
                isRemoteSyncing.current = false;
              }, 120);
            }
          } catch {
            // Ignore malformed third-party frames.
          }
        }
      };

      socket.onclose = () => {
        setIsConnected(false);
        clearHeartbeat();
        if (wsRef.current === socket) {
          wsRef.current = null;
        }
        scheduleReconnect();
      };

      socket.onerror = () => {
        setIsConnected(false);
      };
    };

    connect();

    return () => {
      disposed = true;
      clearHeartbeat();
      if (canvasSyncTimer.current) {
        window.clearTimeout(canvasSyncTimer.current);
        canvasSyncTimer.current = null;
      }
      if (reconnectTimer.current) {
        window.clearTimeout(reconnectTimer.current);
        reconnectTimer.current = null;
      }
      const socket = wsRef.current;
      if (socket?.readyState === WebSocket.OPEN) {
        sendFrame('DISCONNECT', { receipt: `disconnect-${projectId}` });
        socket.close();
      } else if (socket) {
        socket.close();
      }
      wsRef.current = null;
      setIsConnected(false);
    };
  }, [currentUserId, loadCanvas, loadPcb, projectId, sendFrame, subscribeToProject]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      const now = Date.now();
      setActiveUsers((prev) => {
        const next = Object.fromEntries(
          Object.entries(prev).filter(([, collaborator]) => now - collaborator.lastSeen < STALE_CURSOR_MS)
        );
        return Object.keys(next).length === Object.keys(prev).length ? prev : next;
      });
    }, 3000);

    return () => window.clearInterval(timer);
  }, []);

  const flushCanvasSync = useCallback(() => {
    const pending = pendingCanvasSync.current;
    pendingCanvasSync.current = null;
    canvasSyncTimer.current = null;

    if (!pending || isRemoteSyncing.current) return;
    const payload = {
      eventType: 'CANVAS_SYNC',
      payload: pending,
      projectId,
      timestamp: Date.now(),
      userId: currentUserId,
    };
    const serialized = JSON.stringify(payload);
    if (serialized === lastCanvasPayload.current) return;

    lastCanvasPayload.current = serialized;
    sendFrame(
      'SEND',
      {
        'content-type': 'application/json',
        destination: `/app/project/${projectId}/canvas.update`,
      },
      payload
    );
  }, [currentUserId, projectId, sendFrame]);

  const broadcastCanvasSync = useCallback(
    (
      nodes: CanvasNode[],
      wires: Wire[],
      viewport?: { x: number; y: number; scale: number },
      pcbLayout?: PcbLayout,
    ) => {
      if (isRemoteSyncing.current || !isConnected) return;

      pendingCanvasSync.current = { nodes, wires, viewport, pcbLayout };
      if (canvasSyncTimer.current) return;
      canvasSyncTimer.current = window.setTimeout(flushCanvasSync, CANVAS_SYNC_DEBOUNCE_MS);
    },
    [flushCanvasSync, isConnected]
  );

  const broadcastCursorMove = useCallback(
    (x: number, y: number) => {
      if (!isConnected) return;
      const now = Date.now();
      if (now - lastCursorAt.current < CURSOR_THROTTLE_MS) return;
      lastCursorAt.current = now;

      sendFrame(
        'SEND',
        {
          'content-type': 'application/json',
          destination: `/app/project/${projectId}/cursor.move`,
        },
        {
          color: userColor.current,
          displayName,
          projectId,
          timestamp: now,
          userId: currentUserId,
          x,
          y,
        }
      );
    },
    [currentUserId, displayName, isConnected, projectId, sendFrame]
  );

  return {
    activeUsers,
    broadcastCanvasSync,
    broadcastCursorMove,
    isConnected,
  };
}
