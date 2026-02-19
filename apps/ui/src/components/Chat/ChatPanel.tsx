'use client';

import { useState } from 'react';

export default function ChatPanel() {
  const [input, setInput] = useState('');

  return (
    <section className="chat-panel glass-panel">
      <header className="chat-header">
        <span>Bud</span>
        <button type="button">✕</button>
      </header>
      <div className="messages">
        <div className="bubble bud">Hello! How can I help you today?</div>
        <div className="quick-actions">
          <button type="button">Read src/main.ts</button>
          <button type="button">Run tests</button>
          <button type="button">Git status</button>
        </div>
      </div>
      <div className="composer">
        <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Type a message..." />
        <button type="button">Send</button>
      </div>

      <style jsx>{`
        .chat-panel { display: flex; flex-direction: column; min-height: 260px; }
        .chat-header { height: 40px; border-bottom: 1px solid rgba(255,255,255,0.08); display: flex; align-items: center; justify-content: space-between; padding: 0 12px; }
        .chat-header button { background: transparent; border: none; color: var(--text-secondary); cursor: pointer; }
        .messages { flex: 1; padding: 12px; display: flex; flex-direction: column; gap: 10px; }
        .bubble { max-width: 88%; padding: 8px 10px; border-radius: 10px; font-size: 13px; }
        .bubble.bud { background: rgba(255,255,255,0.08); color: var(--text-primary); }
        .quick-actions { display: flex; gap: 8px; flex-wrap: wrap; }
        .quick-actions button { height: 28px; border: 1px solid rgba(255,255,255,0.12); border-radius: 8px; background: transparent; color: var(--text-secondary); padding: 0 8px; }
        .composer { display: flex; gap: 8px; border-top: 1px solid rgba(255,255,255,0.08); padding: 12px; }
        .composer input { flex: 1; height: 32px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.12); background: var(--bg-secondary); color: var(--text-primary); padding: 0 10px; }
        .composer button { height: 32px; border-radius: 8px; border: none; background: var(--accent-blue); color: #fff; padding: 0 12px; }
      `}</style>
    </section>
  );
}
