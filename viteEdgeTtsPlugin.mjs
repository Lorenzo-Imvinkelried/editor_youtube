/**
 * Responsabilidad Única: Plugin de desarrollo de Vite que conecta el navegador con el worker
 * local de `edge-tts` (`scripts/edge_tts_worker.py` en `.tts-venv/`) mediante los endpoints
 * `/__local-tts/status` y `/__local-tts/synthesize`, permitiendo narración neuronal ilimitada
 * y gratuita en español sin gastar créditos ni reiniciar Python por cada escena.
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';

const SAFE_VOICE_RE = /^[a-zA-Z]{2,3}-[a-zA-Z]{2,4}-[a-zA-Z0-9]+$/;
const SAFE_RATE_RE = /^[+-]?\d{1,2}%$/;
const SAFE_PITCH_RE = /^[+-]?\d{1,2}Hz$/;

function resolveVenvPython(workspaceRoot) {
  const winPython = path.join(workspaceRoot, '.tts-venv', 'Scripts', 'python.exe');
  if (fs.existsSync(winPython)) return winPython;
  const unixPython = path.join(workspaceRoot, '.tts-venv', 'bin', 'python');
  if (fs.existsSync(unixPython)) return unixPython;
  return null;
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'));
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res, status, payload) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(payload));
}

class EdgeTtsWorkerPool {
  constructor(workspaceRoot) {
    this.workspaceRoot = workspaceRoot;
    this.child = null;
    this.nextId = 1;
    this.pending = new Map();
    this.queue = Promise.resolve();
  }

  getPythonPath() {
    return resolveVenvPython(this.workspaceRoot);
  }

  getWorkerScriptPath() {
    return path.join(this.workspaceRoot, 'scripts', 'edge_tts_worker.py');
  }

  isAvailable() {
    return Boolean(this.getPythonPath() && fs.existsSync(this.getWorkerScriptPath()));
  }

  ensureSpawned() {
    if (this.child && !this.child.killed && this.child.exitCode === null) {
      return;
    }

    const pythonPath = this.getPythonPath();
    const scriptPath = this.getWorkerScriptPath();
    if (!pythonPath || !fs.existsSync(scriptPath)) {
      throw new Error(
        'No se encontró el entorno local `.tts-venv` con edge-tts instalado.'
      );
    }

    const child = spawn(pythonPath, ['-u', scriptPath], {
      cwd: this.workspaceRoot,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        PYTHONIOENCODING: 'utf-8',
        PYTHONUTF8: '1'
      }
    });

    const rl = readline.createInterface({ input: child.stdout });
    rl.on('line', (line) => {
      try {
        const msg = JSON.parse(line);
        const entry = this.pending.get(msg.id);
        if (entry) {
          clearTimeout(entry.timer);
          this.pending.delete(msg.id);
          entry.resolve(msg);
        }
      } catch {
        // Ignorar líneas de log no JSON
      }
    });

    child.on('exit', () => {
      for (const [, entry] of this.pending) {
        clearTimeout(entry.timer);
        entry.reject(new Error('El worker local de edge-tts se detuvo inesperadamente.'));
      }
      this.pending.clear();
      if (this.child === child) {
        this.child = null;
      }
    });

    this.child = child;
  }

  synthesize(requestPayload) {
    // Serializar solicitudes en el worker persistente para mantener orden limpio y evitar rate-limit
    const task = this.queue.then(() => this.runSingleRequest(requestPayload));
    this.queue = task.catch(() => {});
    return task;
  }

  runSingleRequest(requestPayload) {
    this.ensureSpawned();
    const id = this.nextId++;

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error('Tiempo de espera agotado al sintetizar voz con edge-tts (30s).'));
      }, 30000);

      this.pending.set(id, { resolve, reject, timer });
      const payloadLine = JSON.stringify({ id, ...requestPayload }) + '\n';
      this.child.stdin.write(payloadLine, 'utf8', (err) => {
        if (err) {
          clearTimeout(timer);
          this.pending.delete(id);
          reject(err);
        }
      });
    });
  }

  dispose() {
    if (this.child && !this.child.killed) {
      this.child.kill();
    }
    this.child = null;
  }
}

export function localEdgeTtsPlugin() {
  return {
    name: 'infinite-editor-local-edge-tts',
    configureServer(server) {
      const workspaceRoot = server.config.root || process.cwd();
      const workerPool = new EdgeTtsWorkerPool(workspaceRoot);

      server.httpServer?.on('close', () => workerPool.dispose());

      server.middlewares.use('/__local-tts', async (req, res, next) => {
        try {
          const urlObj = new URL(req.url || '/', 'http://localhost');
          const subPath = urlObj.pathname;

          if (subPath === '/status' && req.method === 'GET') {
            return sendJson(res, 200, {
              ok: true,
              available: workerPool.isAvailable(),
              engine: 'edge-tts',
              pythonPath: workerPool.getPythonPath()
            });
          }

          if (subPath === '/synthesize' && req.method === 'POST') {
            if (!workerPool.isAvailable()) {
              return sendJson(res, 503, {
                ok: false,
                error:
                  'Motor gratuito edge-tts no encontrado en `.tts-venv`. Ejecutá la instalación en D:.'
              });
            }

            const body = await readJsonBody(req);
            const text = String(body.text || '').trim();
            const voice = String(body.voice || 'es-MX-DaliaNeural').trim();
            const rate = String(body.rate || '+0%').trim();
            const pitch = String(body.pitch || '+0Hz').trim();

            if (!text || text.length > 6000) {
              return sendJson(res, 400, {
                ok: false,
                error: 'El texto debe tener entre 1 y 6000 caracteres.'
              });
            }
            if (!SAFE_VOICE_RE.test(voice)) {
              return sendJson(res, 400, { ok: false, error: 'Nombre de voz inválido.' });
            }
            const safeRate = SAFE_RATE_RE.test(rate) ? rate : '+0%';
            const safePitch = SAFE_PITCH_RE.test(pitch) ? pitch : '+0Hz';

            const result = await workerPool.synthesize({
              text,
              voice,
              rate: safeRate,
              pitch: safePitch
            });

            if (!result.ok || !result.audioBase64) {
              return sendJson(res, 502, {
                ok: false,
                error: result.error || 'No se pudo generar el audio con edge-tts.'
              });
            }

            const mp3Buffer = Buffer.from(result.audioBase64, 'base64');
            res.statusCode = 200;
            res.setHeader('Content-Type', 'audio/mpeg');
            res.setHeader('Content-Length', String(mp3Buffer.length));
            res.setHeader('Cache-Control', 'no-store');
            res.end(mp3Buffer);
            return;
          }

          next();
        } catch (err) {
          sendJson(res, 500, {
            ok: false,
            error: err instanceof Error ? err.message : 'Error interno en bridge edge-tts.'
          });
        }
      });
    }
  };
}
