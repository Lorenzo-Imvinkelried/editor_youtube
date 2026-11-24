/**
 * Responsabilidad Única: Modal limpio para que el usuario:
 * 1) Escriba su idea de tema y copie con 1 click el Prompt Maestro completo para cualquier IA (ChatGPT, Claude, Gemini).
 * 2) Pegue el JSON (DSL) que le devolvió la IA para animar todo el video al instante.
 */

import React, { useMemo, useState } from 'react';
import { Check, Copy, Sparkles, X, Code2 } from 'lucide-react';
import { buildMasterPromptForExternalAi } from '../../ai/masterPromptTemplate';
import { DslScene } from '../../dsl/dslTypes';
import { validateAndParseDsl } from '../../dsl/dslValidator';

interface AiMasterPromptModalProps {
  initialTab: 'copy-prompt' | 'paste-json';
  currentScene: DslScene;
  onApplyDslScene: (newScene: DslScene) => void;
  onClose: () => void;
}

export const AiMasterPromptModal: React.FC<AiMasterPromptModalProps> = ({
  initialTab,
  currentScene,
  onApplyDslScene,
  onClose
}) => {
  const [activeTab, setActiveTab] = useState<'copy-prompt' | 'paste-json'>(initialTab);
  const [topicIdea, setTopicIdea] = useState('');
  const [copied, setCopied] = useState(false);

  const [pastedJson, setPastedJson] = useState(() => JSON.stringify(currentScene, null, 2));
  const [jsonError, setJsonError] = useState<string | null>(null);

  const generatedPrompt = useMemo(
    () => buildMasterPromptForExternalAi(topicIdea),
    [topicIdea]
  );

  const handleCopyPrompt = async () => {
    await navigator.clipboard.writeText(generatedPrompt);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handleApplyPastedJson = () => {
    // Limpiar bloques ```json si la IA los incluyó
    const cleaned = pastedJson
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/\s*```$/, '')
      .trim();

    const validation = validateAndParseDsl(cleaned);
    if (!validation.valid || !validation.scene) {
      setJsonError(validation.error || 'El JSON no es válido');
      return;
    }

    setJsonError(null);
    onApplyDslScene(validation.scene);
    onClose();
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-tabs">
            <button
              type="button"
              className={`modal-tab-btn ${activeTab === 'copy-prompt' ? 'active' : ''}`}
              onClick={() => setActiveTab('copy-prompt')}
            >
              <Sparkles size={14} />
              1. Copiar Prompt Maestro para IA
            </button>
            <button
              type="button"
              className={`modal-tab-btn ${activeTab === 'paste-json' ? 'active' : ''}`}
              onClick={() => setActiveTab('paste-json')}
            >
              <Code2 size={14} />
              2. Pegar Video JSON de la IA
            </button>
          </div>

          <button type="button" className="btn-icon-ghost" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        {activeTab === 'copy-prompt' ? (
          <div className="modal-body">
            <div className="topic-input-box">
              <label>Escribí tu idea o tema del video (opcional, se inserta solo en el prompt):</label>
              <div className="topic-row">
                <input
                  type="text"
                  placeholder='Ej: "Explicación de cómo funciona Bitcoin en 20 segundos con estilo dinámico"'
                  value={topicIdea}
                  onChange={(e) => setTopicIdea(e.target.value)}
                  autoFocus
                />
                <button type="button" className="btn-copy-big" onClick={handleCopyPrompt}>
                  {copied ? <Check size={16} /> : <Copy size={16} />}
                  {copied ? '¡Prompt Copiado!' : 'Copiar Prompt Completo'}
                </button>
              </div>
            </div>

            <textarea
              className="prompt-preview-textarea"
              value={generatedPrompt}
              readOnly
            />
          </div>
        ) : (
          <div className="modal-body">
            <p className="modal-hint">
              Pegá acá el código JSON que te generó ChatGPT, Claude o Gemini (o editá el código actual):
            </p>
            <textarea
              className="prompt-preview-textarea code-font"
              value={pastedJson}
              onChange={(e) => setPastedJson(e.target.value)}
              spellCheck={false}
            />
            {jsonError && <div className="json-error-banner">{jsonError}</div>}
            <div className="modal-footer-actions">
              <button type="button" className="btn-secondary" onClick={onClose}>
                Cancelar
              </button>
              <button type="button" className="btn-copy-big" onClick={handleApplyPastedJson}>
                <Check size={16} />
                Aplicar y Animar Video
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
