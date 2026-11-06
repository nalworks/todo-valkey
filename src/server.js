import http from 'node:http';

import { createHandler } from './app.js';
import { ValkeyStore } from './store.js';

const PORT = Number(process.env.PORT) || 8080;

const store = new ValkeyStore();

try {
  await store.connect();
  console.log('Connected to Valkey');
} catch (err) {
  // Start anyway so /health can report the failure instead of the process
  // crashing during boot.
  console.error(`Failed to connect to Valkey: ${err.message}`);
}

const server = http.createServer(createHandler(store));

server.listen(PORT, () => {
  console.log(`todo-valkey listening on http://0.0.0.0:${PORT}`);
});

async function shutdown(signal) {
  console.log(`Received ${signal}, shutting down`);
  server.close();
  try {
    await store.close();
  } catch {
    // ignore errors during shutdown
  }
  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
