import { useEffect, useRef, useState, useCallback } from 'react';
import type { WebSocketMessage } from '../types/index.js';
import { useAppStore } from '../stores/appStore';

export function useWebSocket() {
  const [connected, setConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState<WebSocketMessage | null>(null);
  const ws = useRef<WebSocket | null>(null);
  const reconnectTimeout = useRef<number>();
  
  // Get store actions once, stable reference
  const setAgentStatus = useAppStore.getState().setAgentStatus;
  const upsertTask = useAppStore.getState().upsertTask;

  const connect = useCallback(() => {
    ws.current = new WebSocket('ws://localhost:3001/ws');

    ws.current.onopen = () => {
      setConnected(true);
    };

    ws.current.onmessage = (event) => {
      const message = JSON.parse(event.data) as WebSocketMessage;
      setLastMessage(message);

      if (message.type === 'agent:status') {
        setAgentStatus(message.payload.agentId, message.payload.status);
      }

      if (message.type === 'task:update' || message.type === 'task:created') {
        upsertTask(message.payload);
      }
    };

    ws.current.onclose = () => {
      setConnected(false);
      reconnectTimeout.current = window.setTimeout(connect, 3000);
    };
    
    ws.current.onerror = () => {
      // Let onclose handle reconnection
    };
  }, []); // ← No dependencies = stable forever

  useEffect(() => {
    connect();
    return () => {
      if (reconnectTimeout.current) {
        window.clearTimeout(reconnectTimeout.current);
      }
      ws.current?.close();
    };
  }, [connect]);

  const sendMessage = useCallback((message: WebSocketMessage) => {
    if (ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify(message));
    }
  }, []);

  return { connected, lastMessage, sendMessage };
}
