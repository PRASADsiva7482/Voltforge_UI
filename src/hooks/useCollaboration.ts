import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../auth/useAuth';
import keycloak from '../auth/keycloak';
import { getBaseURL } from '../api/client';
import { useCanvasStore } from '../store/canvasStore';
import { usePcbStore } from '../store/pcbStore';
import { useProjectStore } from '../store/projectStore';
import { useToastStore } from '../store/useToastStore';

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
const STABLE_CONNECTION_MS = 30_000;
// Complete UTF-8 STOMP frame, matching WebSocketConfig.STOMP_MESSAGE_LIMIT_BYTES.
const MAX_STOMP_FRAME_BYTES = 1024 * 1024;
const FRAME_ENCODER = new TextEncoder();
const TERMINAL_CLOSE_CODES = new Set([1002, 1003, 1007, 1008, 1009]);

function resolveNativeWsUrl(): string {
  const runtimeWs = typeof window !== 'undefined' ? window.config?.api?.wsUrl : undefined;
  if (runtimeWs) return runtimeWs;

  const explicit = import.meta.env.VITE_WS_BASE_URL as string | undefined;
  if (explicit) return explicit;

  const apiBase = getBaseURL();

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
  const lastCursorAt = useRef(0);
  const heartbeatRef = useRef<number | null>(null);
  const canvasSyncTimer = useRef<number | null>(null);
  const reconnectTimer = useRef<number | null>(null);
  const stableConnectionTimer = useRef<number | null>(null);
  const reconnectBlocked = useRef(false);
  const reconnectAttempts = useRef(0);
  const pendingCanvasSync = useRef(false);
  const lastCanvasRevision = useRef<string>('');
  const remoteConflictReported = useRef(false);
  const userColor = useRef(COLLABORATOR_COLORS[Math.floor(Math.random() * COLLABORATOR_COLORS.length)]);

  const loadCanvas = useCanvasStore((s) => s.loadCanvas);
  const loadPcb = usePcbStore((s) => s.loadPcb);

  const currentUserId = user?.keycloakId || 'anon';
  const displayName = user?.displayName || user?.username || 'Collaborator';

  const blockLiveSync = useCallback((message: string) => {
    if (reconnectBlocked.current) return;
    reconnectBlocked.current = true;
    pendingCanvasSync.current = false;
    for (const timer of [canvasSyncTimer, reconnectTimer, stableConnectionTimer]) {
      if (timer.current !== null) window.clearTimeout(timer.current);
      timer.current = null;
    }
    if (heartbeatRef.current !== null) window.clearInterval(heartbeatRef.current);
    heartbeatRef.current = null;
    setIsConnected(false);
    useToastStore.getState().addToast(message, 'error');
    wsRef.current?.close();
  }, []);

  const sendFrame = useCallback((command: string, headers: Record<string, string>, body?: unknown) => {
    const socket = wsRef.current;
    if (reconnectBlocked.current || !socket || socket.readyState !== WebSocket.OPEN) return false;
    const frame = buildStompFrame(command, headers, body);
    if (FRAME_ENCODER.encode(frame).byteLength > MAX_STOMP_FRAME_BYTES) {
      blockLiveSync('Live Sync paused: this update exceeds the 1 MiB limit. Your edits are still in this tab. Reduce the project size and save before reopening.');
      return false;
    }
    socket.send(frame);
    return true;
  }, [blockLiveSync]);

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
    reconnectAttempts.current = 0;

    const clearStableTimer = () => {
      if (stableConnectionTimer.current !== null) window.clearTimeout(stableConnectionTimer.current);
      stableConnectionTimer.current = null;
    };

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
      if (disposed || reconnectBlocked.current) return;
      const socket = new WebSocket(resolveNativeWsUrl());
      wsRef.current = socket;
      const isCurrent = () => !disposed && wsRef.current === socket;

      socket.onopen = async () => {
        if (keycloak.token) {
          await keycloak.updateToken(30).catch(() => undefined);
        }
        if (!isCurrent() || socket.readyState !== WebSocket.OPEN) return;

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
        if (!isCurrent() || reconnectBlocked.current) return;
        const raw = event.data as string;
        if (!raw || raw === '\n') return;

        for (const frame of readStompBodies(raw)) {
          if (frame.command === 'CONNECTED') {
            // A quick CONNECTED -> close loop is still a failed connection.
            clearStableTimer();
            stableConnectionTimer.current = window.setTimeout(() => {
              if (isCurrent()) reconnectAttempts.current = 0;
              stableConnectionTimer.current = null;
            }, STABLE_CONNECTION_MS);
            lastCanvasRevision.current = '';
            setIsConnected(true);
            subscribeToProject();
            clearHeartbeat();
            heartbeatRef.current = window.setInterval(() => {
              if (isCurrent() && socket.readyState === WebSocket.OPEN) socket.send('\n');
            }, 20_000);
            continue;
          }

          if (frame.command === 'ERROR') {
            // A STOMP ERROR is a protocol/application rejection (for example
            // edit access denied), not a transient network disconnect. Do not
            // immediately reconnect and make the editor header flap forever.
            blockLiveSync('Live Sync paused because the server rejected the connection or update. Your local edits are retained. Check project access, then reopen it to retry.');
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
              // A peer frame must not overwrite a local edit or in-flight save.
              const project = useProjectStore.getState();
              if (project.isDirty || project.isSaving) {
                if (!remoteConflictReported.current) useToastStore.getState().addToast('Remote changes arrived while you have local edits. Reload to resolve the latest project version.', 'info');
                remoteConflictReported.current = true;
                continue;
              }
              remoteConflictReported.current = false;
              loadCanvas(data.payload.nodes || [], data.payload.wires || [], data.payload.viewport, data.payload.routeCache);
              if (data.payload.pcbLayout) {
                loadPcb(data.payload.pcbLayout);
              }
            }
          } catch {
            // Ignore malformed third-party frames.
          }
        }
      };

      socket.onclose = (event) => {
        if (!isCurrent()) return;
        setIsConnected(false);
        clearHeartbeat();
        clearStableTimer();
        if (wsRef.current === socket) {
          wsRef.current = null;
        }
        if (TERMINAL_CLOSE_CODES.has(event.code)) {
          blockLiveSync(event.code === 1009
            ? 'Live Sync paused: the server rejected an oversized update. Your edits are still in this tab. Save successfully before reopening.'
            : 'Live Sync paused because the server rejected the protocol or project access. Your local edits are retained. Reopen the project after resolving the problem.');
        } else {
          scheduleReconnect();
        }
      };

      socket.onerror = () => {
        if (isCurrent()) setIsConnected(false);
      };
    };

    connect();

    return () => {
      disposed = true;
      clearHeartbeat();
      clearStableTimer();
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
      pendingCanvasSync.current = false;
      lastCanvasRevision.current = '';
      remoteConflictReported.current = false;
      setIsConnected(false);
    };
  }, [blockLiveSync, currentUserId, loadCanvas, loadPcb, projectId, sendFrame, subscribeToProject]);

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
    pendingCanvasSync.current = false;
    canvasSyncTimer.current = null;

    if (!pending) return;
    const project = useProjectStore.getState().currentProject;
    if (project?.id !== projectId || project.owner?.keycloakId !== currentUserId) return;
    const canvas = useCanvasStore.getState(), pcb = usePcbStore.getState();
    const revision = `${canvas.documentRevision}:${pcb.documentRevision}`;
    if (lastCanvasRevision.current === revision) return;
    const payload = {
      eventType: 'CANVAS_SYNC',
      payload: { nodes: canvas.documentNodes, wires: canvas.wires, viewport: canvas.viewport, routeCache: canvas.routeCache, pcbLayout: pcb.getLayout() },
      projectId,
      timestamp: Date.now(),
      userId: currentUserId,
    };
    const sent = sendFrame(
      'SEND',
      {
        'content-type': 'application/json',
        destination: `/app/project/${projectId}/canvas.update`,
      },
      payload
    );
    if (sent) lastCanvasRevision.current = revision;
  }, [currentUserId, projectId, sendFrame]);

  const broadcastCanvasSync = useCallback(
    () => {
      if (!isConnected) return;
      pendingCanvasSync.current = true;
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
