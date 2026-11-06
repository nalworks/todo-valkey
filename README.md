# todo-valkey

A small todo web app built with Node.js 24 and the built-in `node:http` module,
backed by [Valkey](https://valkey.io/) for storage. No web framework, no
database, no filesystem persistence.

## Requirements

- Node.js >= 24
- A reachable Valkey (Redis-compatible) instance

## Configuration

The app is configured entirely through environment variables:

| Variable           | Required | Description                                             |
| ------------------ | -------- | ------------------------------------------------------- |
| `PORT`             | no       | HTTP port to listen on. Defaults to `8080`.             |
| `VALKEY_URL`       | yes\*    | `redis://host:port`. Defaults to `redis://127.0.0.1:6379`. |
| `VALKEY_USERNAME`  | no       | Username if the Valkey instance requires authentication. |
| `VALKEY_PASSWORD`  | no       | Password if the Valkey instance requires authentication. |

\* In practice a real Valkey endpoint is provided by the Agent Runway `valkey`
resource via `VALKEY_URL`.

## Run locally

```sh
npm install
export VALKEY_URL=redis://127.0.0.1:6379
npm start
# or: PORT=3000 npm start
```

## Test

```sh
npm ci
npm test
```

Tests use the in-memory store and a fake Valkey client, so they run without a
real Valkey server and without network access.

## Endpoints

| Method   | Path          | Description                                                        |
| -------- | ------------- | ------------------------------------------------------------------ |
| `GET`    | `/`           | HTML page with the todo list, an add form, and toggle/delete buttons. |
| `GET`    | `/health`     | `200 {"status":"ok","valkey":"ok"}` when `PING` succeeds; otherwise `503 {"status":"error","valkey":"error"}`. |
| `GET`    | `/todos`      | `200` JSON array of `{id,title,done,createdAt}`, newest first.       |
| `POST`   | `/todos`      | Body `{"title":"..."}` → `201` with the created todo. `400` for a missing, blank, or >200 character title. |
| `PATCH`  | `/todos/:id`  | Body `{"done":true|false}` → `200`. `404` if not found.              |
| `DELETE` | `/todos/:id`  | `204` on success. `404` if not found.                               |
| any      | anything else | `404` JSON.                                                        |

### Examples

```sh
curl localhost:8080/todos
curl -X POST localhost:8080/todos -H 'Content-Type: application/json' -d '{"title":"Buy milk"}'
curl -X PATCH localhost:8080/todos/1 -H 'Content-Type: application/json' -d '{"done":true}'
curl -X DELETE localhost:8080/todos/1
```

## Data model

- Hash `todos`: field = id (string), value = `JSON.stringify({id,title,done,createdAt})`
- Counter `todos:next-id`: allocated with `INCR`
- `GET /todos` reads the hash with `HGETALL` and sorts newest first

## Docker

The image is built from a multi-arch `node:24-alpine` base, installs runtime
dependencies with `npm ci --omit=dev`, and starts with `node src/server.js`.

```sh
docker build -t todo-valkey .
docker run --rm -p 8080:8080 -e VALKEY_URL=redis://host:6379 todo-valkey
```
