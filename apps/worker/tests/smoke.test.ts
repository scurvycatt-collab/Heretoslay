import assert from "node:assert/strict";
import test from "node:test";

import { routeRequest, type WorkerEnv } from "../src/router.ts";

test("GET /health is available without touching a room", async () => {
  const env = {
    ROOMS: {
      idFromName: () => {
        throw new Error("room namespace should not be used");
      },
      get: () => {
        throw new Error("room namespace should not be used");
      },
    },
  } satisfies WorkerEnv;
  const response = await routeRequest(new Request("https://local.test/health"), env);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    ok: true,
    service: "here-to-slay-worker",
    scope: "foundation",
  });
});

test("room route normalizes the code and forwards to its Durable Object", async () => {
  let routedName = "";
  let receivedCode = "";
  const env = {
    ROOMS: {
      idFromName(name: string) {
        routedName = name;
        return { name };
      },
      get() {
        return {
          async fetch(request: Request) {
            receivedCode = request.headers.get("x-room-code") ?? "";
            return Response.json({ scaffold: true });
          },
        };
      },
    },
  } satisfies WorkerEnv;
  const response = await routeRequest(new Request("https://local.test/rooms/ab12"), env);
  assert.equal(response.status, 200);
  assert.equal(routedName, "AB12");
  assert.equal(receivedCode, "AB12");
});

test("POST /api/rooms generates a server room code and marks an internal create", async () => {
  let routedName = "";
  let operation = "";
  const env = {
    ROOMS: {
      idFromName(name: string) {
        routedName = name;
        return name;
      },
      get() {
        return {
          async fetch(request: Request) {
            operation = request.headers.get("x-internal-operation") ?? "";
            return Response.json({ roomCode: request.headers.get("x-room-code") }, { status: 201 });
          },
        };
      },
    },
  } satisfies WorkerEnv;
  const response = await routeRequest(
    new Request("https://local.test/api/rooms", {
      method: "POST",
      headers: { "content-type": "application/json", "cf-connecting-ip": "test-create" },
      body: JSON.stringify({ nickname: "Host" }),
    }),
    env,
  );
  assert.equal(response.status, 201);
  assert.match(routedName, /^[A-HJ-NP-Z2-9]{6}$/);
  assert.equal(operation, "CREATE_ROOM");
});

test("POST /api/rooms uses a requested six-character room code", async () => {
  let routedName = "";
  const env = {
    ROOMS: {
      idFromName(name: string) { routedName = name; return name; },
      get() { return { fetch: async (request: Request) => Response.json({ roomCode: request.headers.get("x-room-code") }, { status: 201 }) }; },
    },
  } satisfies WorkerEnv;
  const response = await routeRequest(new Request("https://local.test/api/rooms", {
    method: "POST",
    headers: { "content-type": "application/json", "cf-connecting-ip": "test-custom-create" },
    body: JSON.stringify({ nickname: "Host", roomCode: "slay42" }),
  }), env);
  assert.equal(response.status, 201);
  assert.equal(routedName, "SLAY42");
});

test("POST /api/rooms rejects bodies over 4 KiB before routing", async () => {
  const env = {
    ROOMS: {
      idFromName: () => {
        throw new Error("oversized request must not route");
      },
      get: () => {
        throw new Error("oversized request must not route");
      },
    },
  } satisfies WorkerEnv;
  const response = await routeRequest(
    new Request("https://local.test/api/rooms", {
      method: "POST",
      headers: { "cf-connecting-ip": "test-oversized", "content-length": "5000" },
      body: "{}",
    }),
    env,
  );
  assert.equal(response.status, 413);
  assert.equal((await response.json() as any).error.code, "BODY_TOO_LARGE");
});
