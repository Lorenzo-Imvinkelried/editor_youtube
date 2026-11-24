/**
 * Responsabilidad Única: Panel de Chat de IA exclusivo del proyecto activo.
 * Permite enviar prompts en lenguaje natural que mutan el DSL (`scene.dsl.json`)
 * y guarda la conversación dentro de `chat.history.json` del proyecto actual.
 */

import React, { useState } from 'react';
import { Bot, Send, Sparkles, Wand2 } from 'lucide-react';
import { ProjectChatMessage } from '../../projects/projectTypes';

interface AiChatPanelProps {
  projectId: string;
  messages: ProjectChatMessage[];
  onSendPrompt: (promptText: string) => void;
}

const QUICK_PROMPTS = [
  'Agregá un cohete a la derecha con pop-up y que gire',
  'Poné un gráfico de métricas abajo con efecto wiggle',
  'Agregá una estrella arriba con efecto pulso',
  'Hacé que todos los elementos giren 360 grados',
  'Alejar cámara para mostrar panorama de todo el canvas'
];

export const AiChatPanel: React.FC<AiChatPanelProps> = ({
  projectId,
  messages,
  onSendPrompt
}) => {
  const [input, setInput] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;
    onSendPrompt(input.trim());
    setInput('');
  };

  return (
    <section className="panel-card chat-panel">
      <div className="panel-header">
        <div className="panel-title-group">
          <Bot size={16} className="text-sky" />
          <h3>Chat IA → Compilador DSL</h3>
        </div>
        <span className="panel-tag">{projectId}/chat.history.json</span>
      </div>

      <div className="quick-prompts-bar">
        {QUICK_PROMPTS.map((sample) => (
          <button
            key={sample}
            type="button"
            className="prompt-chip"
            onClick={() => onSendPrompt(sample)}
          >
            <Wand2 size={11} />
            {sample}
          </button>
        ))}
      </div>

      <div className="chat-messages-list">
        {messages.map((msg) => (
          <div key={msg.id} className={`chat-bubble ${msg.role}`}>
            <div className="chat-bubble-meta">
              <span>{msg.role === 'user' ? 'Vos (Prompt)' : 'Copiloto DSL'}</span>
              <span>{new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
            </div>
            <p>{msg.text}</p>
            {msg.appliedOperations && msg.appliedOperations.length > 0 && (
              <div className="operations-list">
                {msg.appliedOperations.map((op) => (
                  <code key={op} className="op-pill">
                    <Sparkles size={10} /> {op}
                  </code>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      <form className="chat-input-row" onSubmit={handleSubmit}>
        <input
          type="text"
          placeholder="Ej: Agregá un cohete a la derecha con pop-up y llevá la cámara ahí..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
        />
        <button type="submit" className="btn-primary" title="Compilar prompt al lenguaje DSL">
          <Send size={14} />
        </button>
      </form>
    </section>
  );
};
