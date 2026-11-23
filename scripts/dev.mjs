// `npm start`: avvia il server di salvataggio (data/storico) e `ng serve` insieme.
// Gli argomenti vengono passati a ng serve, es. `npm start -- --port 4201`.
import { spawn } from 'node:child_process';
import { startStorageServer } from './storage-server.mjs';

const storage = startStorageServer();

const ng = spawn('npx', ['ng', 'serve', ...process.argv.slice(2)], { stdio: 'inherit', shell: true });

const stop = () => {
  storage.close();
  ng.kill();
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
ng.on('exit', code => {
  storage.close();
  process.exit(code ?? 0);
});
