import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

import { createHandler } from '../src/app.js';
import { MemoryStore } from '../src/memory-store.js';

async function startServer(t, store = new MemoryStore()) {
  const server = http.createServer(createHandler(store));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const { port } = server.address();
  return { store, base: `http://127.0.0.1:${port}` };
}

test('GET / returns an HTML page', async (t) => {
  const { base } = await startServer(t);
  const res = await fetch(`${base}/`);
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /text\/html/);
  const body = await res.text();
  assert.match(body, /<html/i);
  assert.match(body, /id="add-form"/);
  assert.match(body, /id="list"/);
});

test('GET /health reports ok when the store responds', async (t) => {
  const { base } = await startServer(t);
  const res = await fetch(`${base}/health`);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { status: 'ok', valkey: 'ok' });
});

test('GET /health reports error when the store is down', async (t) => {
  const store = new MemoryStore();
  store.ping = async () => {
    throw new Error('down');
  };
  const { base } = await startServer(t, store);
  const res = await fetch(`${base}/health`);
  assert.equal(res.status, 503);
  assert.deepEqual(await res.json(), { status: 'error', valkey: 'error' });
});

test('todo lifecycle: create, list, update, delete', async (t) => {
  const { base } = await startServer(t);

  const empty = await fetch(`${base}/todos`);
  assert.equal(empty.status, 200);
  assert.deepEqual(await empty.json(), []);

  const created = await fetch(`${base}/todos`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: 'Buy milk' }),
  });
  assert.equal(created.status, 201);
  const todo = await created.json();
  assert.equal(todo.title, 'Buy milk');
  assert.equal(todo.done, false);
  assert.equal(typeof todo.id, 'number');
  assert.ok(todo.createdAt);

  const list = await fetch(`${base}/todos`);
  assert.equal(list.status, 200);
  const todos = await list.json();
  assert.equal(todos.length, 1);
  assert.deepEqual(todos[0], todo);

  const patched = await fetch(`${base}/todos/${todo.id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ done: true }),
  });
  assert.equal(patched.status, 200);
  const updated = await patched.json();
  assert.equal(updated.done, true);
  assert.equal(updated.id, todo.id);
  assert.equal(updated.title, 'Buy milk');

  const deleted = await fetch(`${base}/todos/${todo.id}`, { method: 'DELETE' });
  assert.equal(deleted.status, 204);

  const after = await fetch(`${base}/todos`);
  assert.deepEqual(await after.json(), []);
});

test('POST /todos rejects invalid titles', async (t) => {
  const { base } = await startServer(t);

  const cases = [
    {},
    { title: '' },
    { title: '   ' },
    { title: 42 },
    { title: 'x'.repeat(201) },
  ];

  for (const body of cases) {
    const res = await fetch(`${base}/todos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    assert.equal(res.status, 400, `expected 400 for ${JSON.stringify(body)}`);
  }

  const max = await fetch(`${base}/todos`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: 'x'.repeat(200) }),
  });
  assert.equal(max.status, 201);
});

test('POST /todos rejects malformed JSON', async (t) => {
  const { base } = await startServer(t);
  const res = await fetch(`${base}/todos`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: 'not-json',
  });
  assert.equal(res.status, 400);
});

test('PATCH /todos/:id requires a boolean done', async (t) => {
  const { base } = await startServer(t);
  const created = await (await fetch(`${base}/todos`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: 'task' }),
  })).json();

  const res = await fetch(`${base}/todos/${created.id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ done: 'yes' }),
  });
  assert.equal(res.status, 400);
});

test('missing todos return 404', async (t) => {
  const { base } = await startServer(t);

  const patch = await fetch(`${base}/todos/999`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ done: true }),
  });
  assert.equal(patch.status, 404);

  const del = await fetch(`${base}/todos/999`, { method: 'DELETE' });
  assert.equal(del.status, 404);
});

test('unknown routes return 404 JSON', async (t) => {
  const { base } = await startServer(t);
  const res = await fetch(`${base}/nope`);
  assert.equal(res.status, 404);
  assert.match(res.headers.get('content-type'), /application\/json/);
  assert.deepEqual(await res.json(), { error: 'not found' });
});

test('GET /todos returns newest first', async (t) => {
  const { store, base } = await startServer(t);

  const first = await store.create('first');
  await new Promise((resolve) => setTimeout(resolve, 5));
  const second = await store.create('second');

  const todos = await (await fetch(`${base}/todos`)).json();
  assert.equal(todos.length, 2);
  assert.equal(todos[0].id, second.id);
  assert.equal(todos[1].id, first.id);
});
