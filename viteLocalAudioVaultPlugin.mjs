/**
 * Responsabilidad Única: Plugin de desarrollo de Vite que expone endpoints locales
 * (`/ __local-audio/*`) para leer, guardar y eliminar físicamente en disco los audios
 * (`voice-master.wav`, `music-loop.wav` y `clips/*.mp3`) dentro de `projects/<id>/assets/audio/`,
 * estrictamente confinado al repositorio local (nunca incluido en builds de producción).
 */

import fs from 'node:fs';
import path from 'node:path';

const SAFE_PROJECT_ID_RE = /^[a-zA-Z0-9_-]{1,100}$/;
const SAFE_CLIP_HASH_RE = /^[a-zA-Z0-9_-]{8,140}$/;
const SAFE_EXT_RE = /^(wav|mp3|m4a|ogg|flac|webm|opus|aac)$/i;

const MIME_BY_EXT = {
  wav: 'audio/wav',
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  ogg: 'audio/ogg',
  flac: 'audio/flac',
  webm: 'audio/webm',
  opus: 'audio/opus',
  aac: 'audio/aac'
};

function resolveProjectAudioDir(workspaceRoot, projectId) {
  if (!SAFE_PROJECT_ID_RE.test(projectId)) return null;
  const projectsRoot = path.resolve(workspaceRoot, 'projects');
  const audioDir = path.resolve(projectsRoot, projectId, 'assets', 'audio');
  if (!audioDir.startsWith(projectsRoot + path.sep)) return null;
  return audioDir;
}

function readVaultMetadata(audioDir) {
  const metaPath = path.join(audioDir, 'audio-vault.json');
  try {
    if (!fs.existsSync(metaPath)) return {};
    return JSON.parse(fs.readFileSync(metaPath, 'utf8')) || {};
  } catch {
    return {};
  }
}

function writeVaultMetadata(audioDir, meta) {
  fs.mkdirSync(audioDir, { recursive: true });
  const metaPath = path.join(audioDir, 'audio-vault.json');
  fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2), 'utf8');
}

function readRequestBuffer(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function sendJson(res, status, payload) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(payload));
}

function findFallbackTrackFile(audioDir, channel) {
  const prefix = channel === 'voice' ? 'voice-master.' : 'music-loop.';
  try {
    if (!fs.existsSync(audioDir)) return null;
    const files = fs.readdirSync(audioDir);
    const match = files.find((f) => f.startsWith(prefix));
    return match || null;
  } catch {
    return null;
  }
}

export function localAudioVaultPlugin() {
  return {
    name: 'infinite-editor-local-audio-vault',
    configureServer(server) {
      const workspaceRoot = server.config.root || process.cwd();

      server.middlewares.use('/__local-audio', async (req, res, next) => {
        try {
          const urlObj = new URL(req.url || '/', 'http://localhost');
          const subPath = urlObj.pathname;
          const projectId = (urlObj.searchParams.get('projectId') || '').trim();
          const audioDir = resolveProjectAudioDir(workspaceRoot, projectId);

          if (!audioDir) {
            return sendJson(res, 400, { ok: false, error: 'projectId inválido' });
          }

          // 1. Pista maestra de Voz o Música (`projects/<id>/assets/audio/voice-master.<ext>`)
          if (subPath === '/track') {
            const channel = urlObj.searchParams.get('channel');
            if (channel !== 'voice' && channel !== 'music') {
              return sendJson(res, 400, { ok: false, error: 'channel inválido' });
            }

            if (req.method === 'POST') {
              const rawExt = (urlObj.searchParams.get('ext') || 'wav').toLowerCase();
              const ext = SAFE_EXT_RE.test(rawExt) ? rawExt : 'wav';
              const trackName = (urlObj.searchParams.get('name') || '').trim();
              const fileName = `${channel === 'voice' ? 'voice-master' : 'music-loop'}.${ext}`;

              fs.mkdirSync(audioDir, { recursive: true });
              const body = await readRequestBuffer(req);
              if (body.length === 0) {
                return sendJson(res, 400, { ok: false, error: 'Audio vacío' });
              }

              // Eliminar versión previa con otra extensión si existía
              const meta = readVaultMetadata(audioDir);
              const prevFile = meta[channel]?.fileName;
              if (prevFile && prevFile !== fileName) {
                const prevPath = path.join(audioDir, prevFile);
                if (fs.existsSync(prevPath)) fs.unlinkSync(prevPath);
              }

              const targetPath = path.join(audioDir, fileName);
              fs.writeFileSync(targetPath, body);

              const mimeType = MIME_BY_EXT[ext] || 'audio/wav';
              meta[channel] = {
                fileName,
                name: trackName || (channel === 'voice' ? 'Voz guardada en disco' : 'Música guardada en disco'),
                mimeType,
                sizeBytes: body.length,
                savedAt: new Date().toISOString()
              };
              writeVaultMetadata(audioDir, meta);

              const relativePath = `projects/${projectId}/assets/audio/${fileName}`;
              return sendJson(res, 200, {
                ok: true,
                relativePath,
                sizeBytes: body.length
              });
            }

            if (req.method === 'GET') {
              const meta = readVaultMetadata(audioDir);
              const entry = meta[channel];
              const fileName = entry?.fileName || findFallbackTrackFile(audioDir, channel);
              if (!fileName) {
                return sendJson(res, 404, { ok: false });
              }

              const filePath = path.join(audioDir, fileName);
              if (!fs.existsSync(filePath)) {
                return sendJson(res, 404, { ok: false });
              }

              const ext = path.extname(fileName).replace('.', '').toLowerCase();
              const mimeType = entry?.mimeType || MIME_BY_EXT[ext] || 'audio/wav';
              const stat = fs.statSync(filePath);

              res.statusCode = 200;
              res.setHeader('Content-Type', mimeType);
              res.setHeader('Content-Length', String(stat.size));
              res.setHeader('Cache-Control', 'no-store');
              res.setHeader(
                'X-Audio-Name',
                encodeURIComponent(entry?.name || fileName)
              );
              res.setHeader(
                'X-Audio-Path',
                encodeURIComponent(`projects/${projectId}/assets/audio/${fileName}`)
              );
              fs.createReadStream(filePath).pipe(res);
              return;
            }

            if (req.method === 'DELETE') {
              const meta = readVaultMetadata(audioDir);
              const fileName = meta[channel]?.fileName || findFallbackTrackFile(audioDir, channel);
              if (fileName) {
                const filePath = path.join(audioDir, fileName);
                if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
              }
              delete meta[channel];
              writeVaultMetadata(audioDir, meta);
              return sendJson(res, 200, { ok: true });
            }
          }

          // 2. Clips individuales de ElevenLabs (`projects/<id>/assets/audio/clips/<hash>.mp3`)
          if (subPath === '/clip') {
            const clipHash = (urlObj.searchParams.get('clipHash') || '').trim();
            if (!SAFE_CLIP_HASH_RE.test(clipHash)) {
              return sendJson(res, 400, { ok: false, error: 'clipHash inválido' });
            }

            const clipsDir = path.join(audioDir, 'clips');
            const clipPath = path.join(clipsDir, `${clipHash}.mp3`);

            if (req.method === 'POST') {
              fs.mkdirSync(clipsDir, { recursive: true });
              const body = await readRequestBuffer(req);
              if (body.length === 0) {
                return sendJson(res, 400, { ok: false, error: 'Clip vacío' });
              }
              fs.writeFileSync(clipPath, body);
              return sendJson(res, 200, {
                ok: true,
                relativePath: `projects/${projectId}/assets/audio/clips/${clipHash}.mp3`,
                sizeBytes: body.length
              });
            }

            if (req.method === 'GET') {
              if (!fs.existsSync(clipPath)) {
                return sendJson(res, 404, { ok: false });
              }
              const stat = fs.statSync(clipPath);
              res.statusCode = 200;
              res.setHeader('Content-Type', 'audio/mpeg');
              res.setHeader('Content-Length', String(stat.size));
              res.setHeader('Cache-Control', 'no-store');
              fs.createReadStream(clipPath).pipe(res);
              return;
            }
          }

          // 3. Consulta masiva rápida de qué clips ya están respaldados en disco
          if (subPath === '/clips-check' && req.method === 'POST') {
            const body = await readRequestBuffer(req);
            const parsed = JSON.parse(body.toString('utf8') || '{}');
            const hashes = Array.isArray(parsed.hashes) ? parsed.hashes : [];
            const clipsDir = path.join(audioDir, 'clips');
            const present = hashes.map(
              (h) =>
                typeof h === 'string' &&
                SAFE_CLIP_HASH_RE.test(h) &&
                fs.existsSync(path.join(clipsDir, `${h}.mp3`))
            );
            return sendJson(res, 200, { ok: true, present });
          }

          next();
        } catch (err) {
          sendJson(res, 500, {
            ok: false,
            error: err instanceof Error ? err.message : 'Error interno en bóveda local'
          });
        }
      });
    }
  };
}
