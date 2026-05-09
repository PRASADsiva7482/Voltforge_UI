import { useEffect, useRef, useState } from 'react';
import { Client } from '@stomp/stompjs';
import SockJS from 'sockjs-client';
import { useAuthStore } from '../store/authStore';
import { useCanvasStore } from '../store/canvasStore';
import keycloak from '../utils/keycloak';

export function useCollaboration(projectId: string) {
  const { user } = useAuthStore();
  const stompClient = useRef<Client | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [activeUsers, setActiveUsers] = useState<Record<string, any>>({});
  const { loadCanvas } = useCanvasStore();

  useEffect(() => {
    if (!projectId || !user || !keycloak.token) return;

    // Determine backend URL (fallback for dev)
    const baseUrl = import.meta.env.VITE_API_BASE_URL || '/api/v1';
    // We use the backend root URL by removing /api/v1 for the WS endpoint
    const wsUrl = window.location.origin.includes('localhost') 
      ? 'http://localhost:2001/voltForge-app/ws' 
      : `${window.location.origin}/ws`;

    const client = new Client({
      webSocketFactory: () => new SockJS(wsUrl),
      connectHeaders: {
        Authorization: `Bearer ${keycloak.token}`,
      },
      debug: (str) => {
        // console.log('STOMP: ', str);
      },
      reconnectDelay: 5000,
      heartbeatIncoming: 4000,
      heartbeatOutgoing: 4000,
    });

    client.onConnect = () => {
      setIsConnected(true);

      // Subscribe to Canvas updates
      client.subscribe(`/topic/project/${projectId}/canvas`, (message) => {
        if (message.body) {
          const event = JSON.parse(message.body);
          // Don't apply our own events
          if (event.userId !== user.id && event.payload) {
             // In a real implementation, we would selectively merge events (CRDTs). 
             // For now, we assume full canvas sync payloads.
             if (event.eventType === 'FULL_SYNC') {
               loadCanvas(event.payload.nodes || [], event.payload.wires || []);
             }
          }
        }
      });

      // Subscribe to Cursors
      client.subscribe(`/topic/project/${projectId}/cursors`, (message) => {
        if (message.body) {
          const event = JSON.parse(message.body);
          if (event.userId !== user.id) {
            setActiveUsers(prev => ({
              ...prev,
              [event.userId]: event
            }));
          }
        }
      });
    };

    client.onStompError = (frame) => {
      console.error('Broker reported error: ' + frame.headers['message']);
      console.error('Additional details: ' + frame.body);
    };

    client.activate();
    stompClient.current = client;

    return () => {
      if (stompClient.current) {
        stompClient.current.deactivate();
      }
    };
  }, [projectId, user, loadCanvas]);

  const broadcastCanvasSync = (nodes: any[], wires: any[]) => {
    if (stompClient.current?.connected && user) {
      stompClient.current.publish({
        destination: `/app/project/${projectId}/canvas.update`,
        body: JSON.stringify({
          projectId,
          userId: user.id,
          eventType: 'FULL_SYNC',
          payload: { nodes, wires },
          timestamp: Date.now()
        })
      });
    }
  };

  const broadcastCursorMove = (x: number, y: number) => {
    if (stompClient.current?.connected && user) {
      stompClient.current.publish({
        destination: `/app/project/${projectId}/cursor.move`,
        body: JSON.stringify({
          projectId,
          userId: user.id,
          displayName: user.displayName || user.username,
          color: '#22c55e', // default green
          x,
          y
        })
      });
    }
  };

  return { isConnected, activeUsers, broadcastCanvasSync, broadcastCursorMove };
}
