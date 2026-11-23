import { Injectable, signal } from '@angular/core';

/*
 * Salvataggio di export e archivi in data/storico.
 *
 * 1. Prima scelta: il server locale avviato da `npm start` (scripts/storage-server.mjs), raggiunto
 *    tramite il proxy /api di ng serve. Scrive direttamente in data/storico, senza chiedere nulla.
 * 2. Se il server non c'è (app avviata con `ng serve` puro o build statica): cartella scelta
 *    dall'utente con la File System Access API di Chrome/Edge.
 * 3. Altrimenti: normale download.
 *
 * Dettagli del punto 2:
 * Il browser non può scrivere in una cartella a sua scelta: la cartella va scelta una volta
 * dall'utente. Il riferimento (handle) viene conservato in IndexedDB, così resta valido anche
 * dopo la chiusura del browser. Ad ogni nuova sessione il browser può chiedere di nuovo il
 * permesso di modifica: la richiesta parte dal clic sul pulsante di export.
 * Nei browser senza questa API (Firefox, Safari) si torna al normale download.
 */

type Permission = 'granted' | 'denied' | 'prompt';
interface DirHandle {
  name: string;
  queryPermission(opts: { mode: 'readwrite' }): Promise<Permission>;
  requestPermission(opts: { mode: 'readwrite' }): Promise<Permission>;
  getFileHandle(name: string, opts: { create: boolean }): Promise<{
    createWritable(): Promise<{ write(data: Blob | string): Promise<void>; close(): Promise<void> }>;
  }>;
}

const DB_NAME = 'manageCost';
const STORE = 'handles';
const KEY = 'exportFolder';

export type SaveResult =
  | { where: 'project'; path: string; fileName: string }
  | { where: 'folder'; folder: string; fileName: string }
  | { where: 'download'; fileName: string };

const API_HEADERS = { 'Content-Type': 'application/json', 'X-Manage-Cost': '1' };

@Injectable({ providedIn: 'root' })
export class ProjectFolderService {
  /** Il browser permette di scegliere una cartella (Chrome/Edge) */
  readonly supported = typeof window !== 'undefined' && 'showDirectoryPicker' in window;
  /** Nome della cartella scelta, null se non ancora scelta */
  readonly folderName = signal<string | null>(null);

  /** Il server locale che salva in data/storico risponde (null = verifica in corso) */
  readonly serverActive = signal<boolean | null>(null);

  private handle: DirHandle | null = null;
  private loaded: Promise<void>;

  constructor() {
    this.loaded = this.supported ? this.load() : Promise.resolve();
    this.checkServer();
  }

  async checkServer(): Promise<boolean> {
    try {
      const res = await fetch('/api/storico/status', { headers: API_HEADERS });
      const ok = res.ok && (await res.json()).ok === true;
      this.serverActive.set(ok);
      return ok;
    } catch {
      this.serverActive.set(false);
      return false;
    }
  }

  private async saveToProject(fileName: string, content: string): Promise<SaveResult | null> {
    try {
      const res = await fetch('/api/storico', { method: 'POST', headers: API_HEADERS, body: JSON.stringify({ fileName, content }) });
      if (!res.ok) return null;
      const body = await res.json();
      this.serverActive.set(true);
      return { where: 'project', path: body.path, fileName: body.fileName };
    } catch {
      this.serverActive.set(false);
      return null;
    }
  }

  /** Apre il selettore di cartelle; restituisce false se l'utente annulla */
  async chooseFolder(): Promise<boolean> {
    if (!this.supported) return false;
    try {
      const picker = (window as unknown as { showDirectoryPicker(o: object): Promise<DirHandle> }).showDirectoryPicker;
      const handle = await picker.call(window, { id: 'manageCost-export', mode: 'readwrite' });
      this.handle = handle;
      this.folderName.set(handle.name);
      await this.idb('readwrite', s => s.put(handle, KEY));
      return true;
    } catch {
      return false; // annullato
    }
  }

  async forgetFolder(): Promise<void> {
    this.handle = null;
    this.folderName.set(null);
    await this.idb('readwrite', s => s.delete(KEY)).catch(() => undefined);
  }

  /**
   * Salva il JSON nella cartella scelta. Se la cartella non è ancora scelta la chiede;
   * se il browser non la supporta o il permesso è negato, scarica il file come prima.
   */
  async saveJson(data: unknown, fileName: string): Promise<SaveResult> {
    const content = JSON.stringify(data, null, 2);

    const project = await this.saveToProject(fileName, content);
    if (project) return project;

    await this.loaded;

    if (this.supported) {
      if (!this.handle) await this.chooseFolder();
      if (this.handle && await this.ensurePermission(this.handle)) {
        try {
          const file = await this.handle.getFileHandle(fileName, { create: true });
          const writable = await file.createWritable();
          await writable.write(content);
          await writable.close();
          return { where: 'folder', folder: this.handle.name, fileName };
        } catch (err) {
          console.error('Salvataggio nella cartella non riuscito, uso il download', err);
        }
      }
    }

    this.download(content, fileName);
    return { where: 'download', fileName };
  }

  private async ensurePermission(handle: DirHandle): Promise<boolean> {
    try {
      if (await handle.queryPermission({ mode: 'readwrite' }) === 'granted') return true;
      return await handle.requestPermission({ mode: 'readwrite' }) === 'granted';
    } catch {
      return false;
    }
  }

  private download(content: string, fileName: string): void {
    const url = URL.createObjectURL(new Blob([content], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  private async load(): Promise<void> {
    try {
      const handle = await this.idb<DirHandle | undefined>('readonly', s => s.get(KEY));
      if (handle) {
        this.handle = handle;
        this.folderName.set(handle.name);
      }
    } catch {
      // IndexedDB non disponibile: si sceglierà la cartella al primo export
    }
  }

  private idb<T = unknown>(mode: IDBTransactionMode, op: (s: IDBObjectStore) => IDBRequest): Promise<T> {
    return new Promise((resolve, reject) => {
      const open = indexedDB.open(DB_NAME, 1);
      open.onupgradeneeded = () => open.result.createObjectStore(STORE);
      open.onerror = () => reject(open.error);
      open.onsuccess = () => {
        const db = open.result;
        const req = op(db.transaction(STORE, mode).objectStore(STORE));
        req.onsuccess = () => { resolve(req.result as T); db.close(); };
        req.onerror = () => { reject(req.error); db.close(); };
      };
    });
  }
}
