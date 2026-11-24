/**
 * Responsabilidad Única: Modal central para manejar el video como archivo JSON:
 * 1) Descargar todo el video en un archivo `.json` o subir un `.json` desde la PC.
 * 2) Copiar un prompt para que una IA busque/corrija las imágenes del JSON actual.
 * 3) Copiar el Prompt Maestro para crear un video nuevo o pegar/editar el JSON directamente.
 */

import React, { useMemo, useState } from 'react';
import {
  Check,
  Code2,
  Copy,
  Download,
  Image,
  Sparkles,
  Upload,
  X
} from 'lucide-react';
import { buildMasterPromptForExternalAi } from '../../ai/masterPromptTemplate';
import { DslScene } from '../../dsl/dslTypes';
import { validateAndParseDsl } from '../../dsl/dslValidator';

interface AiMasterPromptModalProps {
  projectId: string;
  initialTab: 'copy-prompt' | 'paste-json';
  currentScene: DslScene;
  onApplyDslScene: (newScene: DslScene) => void;
  onClose: () => void;
}

export const AiMasterPromptModal: React.FC<AiMasterPromptModalProps> = ({
  projectId,
  initialTab,
  currentScene,
  onApplyDslScene,
  onClose
}) => {
  const [activeTab, setActiveTab] = useState<'copy-prompt' | 'paste-json'>(initialTab);
  const [topicIdea, setTopicIdea] = useState('');
  const [copied, setCopied] = useState(false);
  const [copiedFixImagesPrompt, setCopiedFixImagesPrompt] = useState(false);

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

  const handleDownloadSceneJson = () => {
    const jsonString = JSON.stringify(currentScene, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${projectId}.scene.dsl.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 3000);
  };

  const handleUploadSceneJson = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const content = String(reader.result || '');
      setPastedJson(content);
      const validation = validateAndParseDsl(content);
      if (validation.valid && validation.scene) {
        setJsonError(null);
        onApplyDslScene(validation.scene);
        onClose();
      } else {
        setJsonError(validation.error || 'El archivo JSON subido no es válido.');
      }
    };
    reader.readAsText(file);
  };

  const handleCopyPromptToFixImages = async () => {
    const imageNodesOnly = currentScene.nodes
      .filter((n) => n.type === 'image')
      .map((n) => ({
        id: n.id,
        label: n.label,
        imageQuery: n.imageQuery || '',
        src: n.src || ''
      }));

    const fixPrompt = [
      'Necesito que revises la siguiente lista de nodos de imagen de mi proyecto de video en JSON.',
      'Para cada nodo, buscá en internet una URL pública directa a la imagen real (preferentemente Wikimedia Commons / Wikipedia / Unsplash que termine en .jpg, .png o .webp) o mejorá el término "imageQuery" en inglés para que Wikipedia devuelva la foto exacta.',
      'Devolveme el JSON actualizado con las propiedades "src" y/o "imageQuery" corregidas:',
      '',
      JSON.stringify(imageNodesOnly, null, 2)
    ].join('\n');

    await navigator.clipboard.writeText(fixPrompt);
    setCopiedFixImagesPrompt(true);
    setTimeout(() => setCopiedFixImagesPrompt(false), 2800);
  };

  const handleApplyPastedJson = () => {
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
              className={`modal-tab-btn ${activeTab === 'paste-json' ? 'active' : ''}`}
              onClick={() => setActiveTab('paste-json')}
            >
              <Code2 size={14} />
              Archivo JSON del Video (Descargar / Editar / Subir)
            </button>
            <button
              type="button"
              className={`modal-tab-btn ${activeTab === 'copy-prompt' ? 'active' : ''}`}
              onClick={() => setActiveTab('copy-prompt')}
            >
              <Sparkles size={14} />
              Prompt Maestro para Crear Video con IA
            </button>
          </div>

          <button type="button" className="btn-icon-ghost" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        {activeTab === 'paste-json' ? (
          <div className="modal-body">
            <div className="json-actions-toolbar">
              <button
                type="button"
                className="btn-copy-big"
                onClick={handleDownloadSceneJson}
              >
                <Download size={15} />
                Descargar Video (.json)
              </button>

              <label className="btn-secondary" style={{ cursor: 'pointer' }}>
                <Upload size={15} />
                Subir Archivo (.json)
                <input
                  type="file"
                  accept=".json,application/json"
                  onChange={handleUploadSceneJson}
                  style={{ display: 'none' }}
                />
              </label>

              <button
                type="button"
                className="btn-secondary"
                onClick={handleCopyPromptToFixImages}
                title="Copia solo la lista de imágenes del video para pedirle a una IA que busque los links exactos"
              >
                {copiedFixImagesPrompt ? <Check size={15} /> : <Image size={15} />}
                {copiedFixImagesPrompt
                  ? '¡Lista de Imágenes Copiada!'
                  : 'Copiar Imágenes para que la IA busque Links'}
              </button>
            </div>

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
                Guardar y Aplicar JSON al Video
              </button>
            </div>
          </div>
        ) : (
          <div className="modal-body">
            <div className="topic-input-box">
              <label>Escribí tu idea o tema del video (se inserta automáticamente en el prompt):</label>
              <div className="topic-row">
                <input
                  type="text"
                  placeholder='Ej: "Historia de la Física Cuántica y Niels Bohr con tarjetas luminosas y animaciones variadas"'
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
        )}
      </div>
    </div>
  );
};
