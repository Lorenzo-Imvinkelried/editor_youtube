/**
 * Responsabilidad Única: Modal interactivo para buscar imágenes reales en internet
 * (Wikipedia / Wikimedia Commons) o pegar un link directo de Google Images e insertarlas
 * con efecto Pop-Up en el canvas infinito.
 */

import React, { useState } from 'react';
import { Globe, Link2, Loader2, Search, Sparkles, X } from 'lucide-react';
import {
  InternetImageResult,
  searchInternetImages
} from '../../engine/internetImageSearch';

interface InternetImageSearchModalProps {
  onSelectImage: (imageUrl: string, label: string, query?: string) => void;
  onClose: () => void;
}

const SAMPLE_QUERIES = ['Albert Einstein', 'Bitcoin', 'SpaceX Starship', 'Red Neuronal', ' Planeta Tierra', 'Nikola Tesla'];

export const InternetImageSearchModal: React.FC<InternetImageSearchModalProps> = ({
  onSelectImage,
  onClose
}) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<InternetImageResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [directUrl, setDirectUrl] = useState('');

  const runSearch = async (searchTerm: string) => {
    const clean = searchTerm.trim();
    if (!clean) return;
    setQuery(clean);
    setIsSearching(true);
    try {
      const items = await searchInternetImages(clean, 8);
      setResults(items);
    } finally {
      setIsSearching(false);
    }
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    runSearch(query);
  };

  const handleInsertDirectUrl = (e: React.FormEvent) => {
    e.preventDefault();
    if (!directUrl.trim()) return;
    onSelectImage(directUrl.trim(), 'Imagen Web');
    onClose();
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="header-group">
            <Globe size={17} className="text-sky" />
            <strong>Buscador de Imágenes en Internet (Auto-CORS para MP4)</strong>
          </div>
          <button type="button" className="btn-icon-ghost" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="modal-body">
          {/* 1. Buscador automático en Internet */}
          <form className="topic-row" onSubmit={handleSearchSubmit}>
            <input
              type="text"
              placeholder="Buscá cualquier cosa en internet (ej: Albert Einstein, Bitcoin, Cohete, Cerebro)..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoFocus
            />
            <button type="submit" className="btn-copy-big" disabled={isSearching}>
              {isSearching ? <Loader2 size={16} className="spin-icon" /> : <Search size={16} />}
              Buscar Imágenes
            </button>
          </form>

          <div className="quick-chips-row">
            {SAMPLE_QUERIES.map((q) => (
              <button
                key={q}
                type="button"
                className="corner-pill-btn"
                onClick={() => runSearch(q)}
              >
                <Sparkles size={11} />
                {q}
              </button>
            ))}
          </div>

          {/* Grilla de resultados de internet */}
          <div className="internet-images-grid">
            {isSearching ? (
              <div className="empty-search-state">
                <Loader2 size={24} className="spin-icon text-sky" />
                <span>Buscando imágenes reales en internet...</span>
              </div>
            ) : results.length > 0 ? (
              results.map((item) => (
                <button
                  key={item.url}
                  type="button"
                  className="internet-image-card"
                  onClick={() => {
                    onSelectImage(item.url, item.title.slice(0, 26), query);
                    onClose();
                  }}
                >
                  <img src={item.thumbUrl} alt={item.title} loading="lazy" />
                  <span className="image-card-caption">{item.title}</span>
                </button>
              ))
            ) : (
              <div className="empty-search-state">
                <span>
                  Escribí un tema arriba para buscar fotos reales en internet, o recordá que el Agente IA puede poner{' '}
                  <code>"imageQuery": "tema"</code> en el JSON y el editor descarga la foto solo.
                </span>
              </div>
            )}
          </div>

          {/* 2. Pegar link directo de Google Images */}
          <form className="direct-url-bar" onSubmit={handleInsertDirectUrl}>
            <Link2 size={15} className="text-sky" />
            <input
              type="url"
              placeholder="O pegá acá cualquier link https://... directo de Google Images"
              value={directUrl}
              onChange={(e) => setDirectUrl(e.target.value)}
            />
            <button type="submit" className="btn-secondary">
              Insertar Link
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
