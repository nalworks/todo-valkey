/**
 * In-memory implementation of the todo store interface.
 * Used by the tests (and as a fallback when no Valkey is available). It is
 * intentionally not used for production persistence.
 */
function byNewestFirst(a, b) {
  if (a.createdAt === b.createdAt) {
    return Number(b.id) - Number(a.id);
  }
  return a.createdAt < b.createdAt ? 1 : -1;
}

function clone(todo) {
  return todo ? { ...todo } : null;
}

export class MemoryStore {
  constructor() {
    this.todos = new Map();
    this.nextId = 0;
  }

  async connect() {}

  async close() {}

  async ping() {
    return true;
  }

  async list() {
    return [...this.todos.values()].map(clone).sort(byNewestFirst);
  }

  async get(id) {
    return clone(this.todos.get(String(id)));
  }

  async create(title) {
    const id = ++this.nextId;
    const todo = {
      id,
      title,
      done: false,
      createdAt: new Date().toISOString(),
    };
    this.todos.set(String(id), todo);
    return clone(todo);
  }

  async update(id, patch) {
    const existing = this.todos.get(String(id));
    if (!existing) {
      return null;
    }
    const updated = { ...existing, ...patch, id: existing.id };
    this.todos.set(String(id), updated);
    return clone(updated);
  }

  async remove(id) {
    return this.todos.delete(String(id));
  }
}
