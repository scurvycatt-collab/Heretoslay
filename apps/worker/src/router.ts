export interface DurableObjectStubLike {
  fetch(request: Request): Promise<Response>;
}

export interface DurableObjectNamespaceLike {
  idFromName(name: string): unknown;
  get(id: unknown): DurableObjectStubLike;
}

export interface WorkerEnv {
  ROOMS: DurableObjectNamespaceLike;
  ASSETS?: { fetch(request: Request): Promise<Response> };
}

const ROOM_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const ROOM_CODE_PATTERN = /^[A-Za-z0-9]{3,24}$/;
const MAX_BODY_BYTES = 4_096;
const CREATE_LIMIT = 10;
const CREATE_WINDOW_MS = 60_000;
const createBuckets = new Map<string, { startedAt: number; count: number }>();

function apiError(code: string, message: string, status: number): Response {
  return Response.json(
    { ok: false, error: { code, message } },
    { status, headers: { "cache-control": "no-store" } },
  );
}

function randomRoomCode(): string {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => ROOM_CODE_ALPHABET[byte & 31]).join("");
}

function checkCreateRate(request: Request, now: number): boolean {
  const key = request.headers.get("cf-connecting-ip") ?? "local";
  const bucket = createBuckets.get(key);
  if (!bucket || now - bucket.startedAt >= CREATE_WINDOW_MS) {
    createBuckets.set(key, { startedAt: now, count: 1 });
    return true;
  }
  bucket.count += 1;
  return bucket.count <= CREATE_LIMIT;
}

async function boundedBody(request: Request): Promise<string | Response> {
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    return apiError("BODY_TOO_LARGE", "Request body exceeds 4 KiB", 413);
  }
  const body = await request.text();
  if (new TextEncoder().encode(body).byteLength > MAX_BODY_BYTES) {
    return apiError("BODY_TOO_LARGE", "Request body exceeds 4 KiB", 413);
  }
  return body;
}

function roomStub(env: WorkerEnv, roomCode: string): DurableObjectStubLike {
  return env.ROOMS.get(env.ROOMS.idFromName(roomCode));
}

function internalRequest(request: Request, roomCode: string): Request {
  const headers = new Headers(request.headers);
  headers.delete("x-room-code");
  headers.delete("x-internal-operation");
  headers.set("x-room-code", roomCode);
  // Cloning from Request preserves Node's duplex metadata for streamed POST bodies.
  // Rebuilding from request.body would require Node-only RequestInit.duplex.
  return new Request(request, { headers });
}

export async function routeRequest(request: Request, env: WorkerEnv): Promise<Response> {
  const url = new URL(request.url);
  if (request.method === "GET" && url.pathname === "/health") {
    return Response.json(
      { ok: true, service: "here-to-slay-worker", scope: "foundation" },
      { headers: { "cache-control": "no-store" } },
    );
  }
  if (request.method === "GET" && url.pathname === "/api/health") {
    return Response.json(
      { ok: true, service: "here-to-slay-worker", scope: "reaction-slice" },
      { headers: { "cache-control": "no-store" } },
    );
  }

  if (request.method === "POST" && url.pathname === "/api/rooms") {
    if (!checkCreateRate(request, Date.now())) {
      return apiError("RATE_LIMITED", "Too many room creation requests", 429);
    }
    const body = await boundedBody(request);
    if (body instanceof Response) return body;
    let requestedRoomCode: unknown;
    try { requestedRoomCode = (JSON.parse(body) as { roomCode?: unknown }).roomCode; }
    catch { return apiError("INVALID_BODY", "Request body must be valid JSON", 400); }
    if (requestedRoomCode !== undefined && (typeof requestedRoomCode !== "string" || !ROOM_CODE_PATTERN.test(requestedRoomCode))) {
      return apiError("INVALID_ROOM_CODE", "Room code must contain 3 to 24 letters or digits", 400);
    }
    const roomCode = typeof requestedRoomCode === "string" ? requestedRoomCode.toUpperCase() : randomRoomCode();
    const headers = new Headers(request.headers);
    headers.delete("x-room-code");
    headers.delete("x-internal-operation");
    headers.set("x-room-code", roomCode);
    headers.set("x-internal-operation", "CREATE_ROOM");
    const forwarded = new Request(`https://room.internal/api/rooms/${roomCode}`, {
      method: "POST",
      headers,
      body,
    });
    return roomStub(env, roomCode).fetch(forwarded);
  }

  const apiMatch = /^\/api\/rooms\/([A-Za-z0-9]{3,24})(?:\/(join|watch|snapshot|commands|disconnect|leave))?$/.exec(
    url.pathname,
  );
  if (apiMatch) {
    const roomCode = apiMatch[1].toUpperCase();
    return roomStub(env, roomCode).fetch(internalRequest(request, roomCode));
  }

  // Foundation compatibility: public metadata only; no session or hidden state.
  const legacyMatch = /^\/rooms\/([A-Za-z0-9]{3,24})$/.exec(url.pathname);
  if (legacyMatch) {
    const roomCode = legacyMatch[1].toUpperCase();
    return roomStub(env, roomCode).fetch(internalRequest(request, roomCode));
  }

  if ((request.method === "GET" || request.method === "HEAD") && env.ASSETS) {
    return env.ASSETS.fetch(request);
  }

  return apiError("NOT_FOUND", "Route not found", 404);
}
