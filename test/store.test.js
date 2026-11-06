import test from 'node:test';
import assert from 'node:assert/strict';

import { MemoryStore } from '../src/memory-store.js';
import { ValkeyStore } from '../src/store.js';

/**
 * Minimal in-memory fake of the subset of the node-redis v5 API used by
 * ValkeyStore. It lets us exercise store.js without a real Valkey server or
 * any network access.
 */
class FakeRedisClient {
  constructor() {
    this.isOpen = false;
    this.hash = new Map();
    this.counters = new Map();
    this.pong = 'PONG';
    this.handlers = new Map();
  }

  on(event, handler) {
    this.handlers.set(event, handler);
    return this;
  }

  async connect() {
    this.isOpen = true;
  }

  async quit() {
    this.isOpen = false;
  }

  async ping() {
    return this.pong;
  }

  async hGetAll(key) {
    const result = {};
    for (const [field, value] of this.hash) {
      result[field] = value;
    }
    return result;
  }

  async hGet(key, field) {
    return this.hash.has(field) ? this.hash.get(field) : null;
  }

  async hSet(key, field, value) {
    this.hash.set(field, value);
    return 1;
  }

  async hDel(key, field) {
    return this.hash.delete(field) ? 1 : 0;
  }

  async incr(key) {
    const next = (this.counters.get(key) || 0) + 1;
    this.counters.set(key, next);
    return next;
  }
}

test('ValkeyStore ping reflects the client reply', async () => {
  const client = new FakeRedisClient();
  const store = new ValkeyStore({ client });

  assert.equal(await store.ping(), true);

  client.pong = 'something-else';
  assert.equal(await store.ping(), false);
});

test('ValkeyStore creates, reads, updates and removes todos', async () => {
  const client = new FakeRedisClient();
  const store = new ValkeyStore({ client });

  const created = await store.create('write tests');
  assert.equal(created.id, 1);
  assert.equal(created.title, 'write tests');
  assert.equal(created.done, false);
  assert.ok(created.createdAt);

  // Stored as a JSON string under the stringified id field.
  const raw = await client.hGet('todos', '1');
  assert.deepEqual(JSON.parse(raw), created);

  assert.deepEqual(await store.get(1), created);
  assert.equal(await store.get(2), null);

  const updated = await store.update(1, { done: true });
  assert.equal(updated.done, true);
  assert.equal(updated.title, 'write tests');
  assert.equal(updated.id, 1);

  assert.equal(await store.update(999, { done: true }), null);

  assert.equal(await store.remove(1), true);
  assert.equal(await store.remove(1), false);
  assert.equal(await store.get(1), null);
});

test('ValkeyStore lists todos newest first', async () => {
  const client = new FakeRedisClient();
  const store = new ValkeyStore({ client });

  const first = await store.create('first');
  await new Promise((resolve) => setTimeout(resolve, 5));
  const second = await store.create('second');

  const todos = await store.list();
  assert.equal(todos.length, 2);
  assert.equal(todos[0].id, second.id);
  assert.equal(todos[1].id, first.id);
});

test('ValkeyStore assigns incrementing ids via the next-id counter', async () => {
  const client = new FakeRedisClient();
  const store = new ValkeyStore({ client });

  const a = await store.create('a');
  const b = await store.create('b');
  const c = await store.create('c');

  assert.deepEqual([a.id, b.id, c.id], [1, 2, 3]);
  assert.equal(client.counters.get('todos:next-id'), 3);
});

test('MemoryStore implements the same interface', async () => {
  const store = new MemoryStore();

  assert.equal(await store.ping(), true);
  assert.deepEqual(await store.list(), []);

  const first = await store.create('first');
  await new Promise((resolve) => setTimeout(resolve, 5));
  const second = await store.create('second');
  assert.deepEqual([first.id, second.id], [1, 2]);

  const todos = await store.list();
  assert.equal(todos[0].id, second.id);
  assert.equal(todos[1].id, first.id);

  const updated = await store.update(first.id, { done: true });
  assert.equal(updated.done, true);
  assert.equal((await store.get(first.id)).done, true);

  assert.equal(await store.update(999, { done: true }), null);
  assert.equal(await store.remove(second.id), true);
  assert.equal(await store.remove(second.id), false);
  assert.equal(await store.get(second.id), null);
});
