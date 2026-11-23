// Piccolo server locale che salva export e archivi dell'app direttamente in data/storico.
// Lo avvia `npm start` insieme a `ng serve`; il dev server di Angular gli inoltra le chiamate /api
// (vedi proxy.conf.json). Ascolta solo su 127.0.0.1, quindi non è raggiungibile da altri computer.
//
//   GET  /api/storico/status  -> { ok: true, folder }
//   POST /api/storico         -> body { fileName, content }  -> { ok: true, fileName, path }

import { createServer } from 'node:http';
import { mkdir, writeFile, access } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const STORAGE_PORT = Number(process.env.STORAGE_PORT || 4300);
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const FOLDER = join(ROOT, 'data', 'storico');
const MAX_BYTES = 100 * 1024 * 1024;
const FILE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,120}\.json$/;

function send(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

/** Solo richieste dall'app in locale: header personalizzato e, se presente, origine localhost */
function allowed(req) {
  if (req.headers['x-manage-cost'] !== '1') return false;
  const origin = req.headers.origin;
  return !origin || /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(origin);
}

async function exists(path) {
  try { await access(path); return true; } catch { return false; }
}

/** Non sovrascrive mai: se il nome esiste già aggiunge -2, -3, … */
async function freeName(fileName) {
  const base = fileName.replace(/\.json$/, '');
  let name = fileName;
  for (let i = 2; await exists(join(FOLDER, name)); i++) name = `${base}-${i}.json`;
  return name;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', c => {
      size += c.length;
      if (size > MAX_BYTES) { reject(new Error('File troppo grande')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

export function startStorageServer(port = STORAGE_PORT) {
  const server = createServer(async (req, res) => {
    const url = (req.url || '').split('?')[0];
    try {
      if (!allowed(req)) return send(res, 403, { ok: false, error: 'Richiesta non consentita' });

      if (req.method === 'GET' && url === '/api/storico/status') {
        return send(res, 200, { ok: true, folder: 'data/storico' });
      }

      if (req.method === 'POST' && url === '/api/storico') {
        const { fileName, content } = JSON.parse(await readBody(req));
        if (typeof fileName !== 'string' || !FILE_NAME.test(fileName)) return send(res, 400, { ok: false, error: 'Nome file non valido' });
        if (typeof content !== 'string') return send(res, 400, { ok: false, error: 'Contenuto mancante' });
        JSON.parse(content); // deve essere JSON valido

        await mkdir(FOLDER, { recursive: true });
        const name = await freeName(fileName);
        await writeFile(join(FOLDER, name), content, 'utf8');
        console.log(`[storico] salvato data/storico/${name}`);
        return send(res, 200, { ok: true, fileName: name, path: `data/storico/${name}` });
      }

      send(res, 404, { ok: false, error: 'Non trovato' });
    } catch (err) {
      send(res, 500, { ok: false, error: String(err?.message || err) });
    }
  });

  server.on('error', err => {
    if (err.code === 'EADDRINUSE') {
      console.log(`[storico] porta ${port} già in uso: uso il server di salvataggio già avviato`);
    } else {
      console.error('[storico] errore', err);
    }
  });
  server.listen(port, '127.0.0.1', () => console.log(`[storico] salvataggio in data/storico attivo su 127.0.0.1:${port}`));
  return server;
}

// Avvio diretto: node scripts/storage-server.mjs
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  startStorageServer();
}
