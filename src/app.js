const MAX_TITLE_LENGTH = 200;
const MAX_BODY_BYTES = 1024 * 1024;

function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
  });
  res.end(payload);
}

function sendHtml(res, html) {
  res.writeHead(200, {
    'Content-Type': 'text/html; charset=utf-8',
    'Content-Length': Buffer.byteLength(html),
  });
  res.end(html);
}

async function readJsonBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) {
      const err = new Error('payload too large');
      err.statusCode = 413;
      throw err;
    }
    chunks.push(chunk);
  }
  if (size === 0) {
    return {};
  }
  const text = Buffer.concat(chunks).toString('utf8');
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    const err = new Error('invalid JSON');
    err.statusCode = 400;
    throw err;
  }
}

function renderPage() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Todo Valkey</title>
<style>
  :root { color-scheme: light dark; }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    font-family: system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    background: #0f172a;
    color: #e2e8f0;
    display: flex;
    justify-content: center;
    padding: 2rem 1rem;
  }
  main { width: 100%; max-width: 32rem; }
  h1 { font-size: 1.5rem; margin: 0 0 1rem; }
  form { display: flex; gap: 0.5rem; margin-bottom: 1rem; }
  input[type="text"] {
    flex: 1;
    padding: 0.6rem 0.75rem;
    border-radius: 0.5rem;
    border: 1px solid #334155;
    background: #1e293b;
    color: inherit;
    font-size: 1rem;
  }
  button {
    padding: 0.6rem 0.9rem;
    border-radius: 0.5rem;
    border: 1px solid #334155;
    background: #2563eb;
    color: #fff;
    font-size: 0.95rem;
    cursor: pointer;
  }
  button.secondary { background: #1e293b; }
  button.danger { background: #b91c1c; }
  ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.5rem; }
  li {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.6rem 0.75rem;
    border-radius: 0.5rem;
    background: #1e293b;
    border: 1px solid #334155;
  }
  li .title { flex: 1; word-break: break-word; }
  li.done .title { text-decoration: line-through; opacity: 0.6; }
  .empty { opacity: 0.6; font-style: italic; }
</style>
</head>
<body>
<main>
  <h1>Todo Valkey</h1>
  <form id="add-form">
    <input id="title" type="text" maxlength="${MAX_TITLE_LENGTH}" placeholder="Add a todo..." autocomplete="off">
    <button type="submit">Add</button>
  </form>
  <ul id="list"></ul>
</main>
<script>
(function () {
  var listEl = document.getElementById('list');
  var formEl = document.getElementById('add-form');
  var inputEl = document.getElementById('title');

  function load() {
    return fetch('/todos')
      .then(function (res) { return res.json(); })
      .then(render)
      .catch(function () {});
  }

  function render(todos) {
    listEl.textContent = '';
    if (!todos.length) {
      var empty = document.createElement('li');
      empty.className = 'empty';
      empty.textContent = 'No todos yet.';
      listEl.appendChild(empty);
      return;
    }
    todos.forEach(function (todo) {
      var li = document.createElement('li');
      if (todo.done) { li.className = 'done'; }

      var btn = document.createElement('button');
      btn.className = 'secondary';
      btn.textContent = todo.done ? 'Undo' : 'Done';
      btn.addEventListener('click', function () { toggle(todo); });

      var span = document.createElement('span');
      span.className = 'title';
      span.textContent = todo.title;

      var del = document.createElement('button');
      del.className = 'danger';
      del.textContent = 'Delete';
      del.addEventListener('click', function () { remove(todo.id); });

      li.appendChild(btn);
      li.appendChild(span);
      li.appendChild(del);
      listEl.appendChild(li);
    });
  }

  function toggle(todo) {
    fetch('/todos/' + encodeURIComponent(todo.id), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ done: !todo.done })
    }).then(load);
  }

  function remove(id) {
    fetch('/todos/' + encodeURIComponent(id), { method: 'DELETE' }).then(load);
  }

  formEl.addEventListener('submit', function (event) {
    event.preventDefault();
    var title = inputEl.value.trim();
    if (!title) { return; }
    fetch('/todos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: title })
    }).then(function () {
      inputEl.value = '';
      return load();
    });
  });

  load();
})();
</script>
</body>
</html>`;
}

/**
 * Build a node:http request handler bound to the given store.
 * The store only needs to implement list/get/create/update/remove/ping.
 */
export function createHandler(store) {
  return async function handler(req, res) {
    const method = (req.method || 'GET').toUpperCase();

    let path;
    try {
      path = new URL(req.url, 'http://localhost').pathname;
    } catch {
      return sendJson(res, 400, { error: 'bad request' });
    }

    try {
      if (method === 'GET' && path === '/') {
        return sendHtml(res, renderPage());
      }

      if (method === 'GET' && path === '/health') {
        try {
          const ok = await store.ping();
          if (ok) {
            return sendJson(res, 200, { status: 'ok', valkey: 'ok' });
          }
        } catch {
          // fall through to the error response
        }
        return sendJson(res, 503, { status: 'error', valkey: 'error' });
      }

      if (method === 'GET' && path === '/todos') {
        const todos = await store.list();
        return sendJson(res, 200, todos);
      }

      if (method === 'POST' && path === '/todos') {
        let body;
        try {
          body = await readJsonBody(req);
        } catch (err) {
          return sendJson(res, err.statusCode || 400, { error: 'invalid request body' });
        }
        const rawTitle = body.title;
        const title = typeof rawTitle === 'string' ? rawTitle.trim() : '';
        if (!title || title.length > MAX_TITLE_LENGTH) {
          return sendJson(res, 400, { error: 'title is required and must be 1-200 characters' });
        }
        const todo = await store.create(title);
        return sendJson(res, 201, todo);
      }

      const match = path.match(/^\/todos\/([^/]+)$/);
      if (match) {
        const id = decodeURIComponent(match[1]);

        if (method === 'PATCH') {
          let body;
          try {
            body = await readJsonBody(req);
          } catch (err) {
            return sendJson(res, err.statusCode || 400, { error: 'invalid request body' });
          }
          if (typeof body.done !== 'boolean') {
            return sendJson(res, 400, { error: 'done must be a boolean' });
          }
          const updated = await store.update(id, { done: body.done });
          if (!updated) {
            return sendJson(res, 404, { error: 'todo not found' });
          }
          return sendJson(res, 200, updated);
        }

        if (method === 'DELETE') {
          const removed = await store.remove(id);
          if (!removed) {
            return sendJson(res, 404, { error: 'todo not found' });
          }
          res.writeHead(204);
          return res.end();
        }
      }

      return sendJson(res, 404, { error: 'not found' });
    } catch {
      return sendJson(res, 500, { error: 'internal server error' });
    }
  };
}
