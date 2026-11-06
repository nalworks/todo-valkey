import { createClient } from 'redis';

const TODOS_KEY = 'todos';
const NEXT_ID_KEY = 'todos:next-id';

/**
 * Sort todos newest first. Ties are broken by id descending so the output is
 * stable even when two todos share the same millisecond timestamp.
 */
function byNewestFirst(a, b) {
  if (a.createdAt === b.createdAt) {
    return Number(b.id) - Number(a.id);
  }
  return a.createdAt < b.createdAt ? 1 : -1;
}

/**
 * Valkey-backed todo store.
 *
 * Data model:
 *   - hash `todos`: field = id (string), value = JSON.stringify({id,title,done,createdAt})
 *   - counter `todos:next-id`: INCR to allocate ids
 *
 * A client may be injected (used by the tests to run without a real Valkey).
 */
export class ValkeyStore {
  #client;

  constructor({ url, username, password, client } = {}) {
    this.#client = client ?? createClient({
      url: url ?? process.env.VALKEY_URL ?? 'redis://127.0.0.1:6379',
      username: username ?? process.env.VALKEY_USERNAME,
      password: password ?? process.env.VALKEY_PASSWORD,
    });

    // The redis client emits 'error' events; without a listener Node would
    // treat them as unhandled and crash the process.
    if (typeof this.#client.on === 'function') {
      this.#client.on('error', () => {});
    }
  }

  async connect() {
    if (typeof this.#client.isOpen === 'boolean' && this.#client.isOpen) {
      return;
    }
    await this.#client.connect();
  }

  async close() {
    if (typeof this.#client.quit === 'function') {
      await this.#client.quit();
    }
  }

  async ping() {
    const reply = await this.#client.ping();
    return reply === 'PONG' || reply === true;
  }

  async list() {
    const all = await this.#client.hGetAll(TODOS_KEY);
    return Object.values(all)
      .map((value) => JSON.parse(value))
      .sort(byNewestFirst);
  }

  async get(id) {
    const value = await this.#client.hGet(TODOS_KEY, String(id));
    return value ? JSON.parse(value) : null;
  }

  async create(title) {
    const id = await this.#client.incr(NEXT_ID_KEY);
    const todo = {
      id,
      title,
      done: false,
      createdAt: new Date().toISOString(),
    };
    await this.#client.hSet(TODOS_KEY, String(id), JSON.stringify(todo));
    return todo;
  }

  async update(id, patch) {
    const existing = await this.get(id);
    if (!existing) {
      return null;
    }
    const updated = { ...existing, ...patch, id: existing.id };
    await this.#client.hSet(TODOS_KEY, String(id), JSON.stringify(updated));
    return updated;
  }

  async remove(id) {
    const removed = await this.#client.hDel(TODOS_KEY, String(id));
    return removed > 0;
  }
}
