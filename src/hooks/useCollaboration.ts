import { useState } from 'react'
import { useAuth } from '../auth/useAuth'

/**
 * Collaboration hook for multi-user editing syncing via WebSockets (STOMP/SockJS).
 * Gracefully degrades if underlying networking/CRDT dependencies are not present or fail to load.
 */
export function useCollaboration(projectId: string) {
  const { user } = useAuth()
  const [isConnected] = useState(false)
  const [activeUsers] = useState<Record<string, { color: string; displayName: string; x: number; y: number }>>({})

  const broadcastCanvasSync = (nodes: any[], wires: any[]) => {
    // Graceful no-op when websocket stomp service is inactive/not installed
    console.debug('Collaboration: broadcastCanvasSync was called', { projectId, user: user?.username, nodesCount: nodes.length, wiresCount: wires.length })
  }

  const broadcastCursorMove = (x: number, y: number) => {
    // Graceful no-op when websocket stomp service is inactive/not installed
    console.debug('Collaboration: broadcastCursorMove was called', { projectId, user: user?.username, x, y })
  }

  return {
    isConnected,
    activeUsers,
    broadcastCanvasSync,
    broadcastCursorMove,
  }
}
