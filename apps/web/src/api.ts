import type { RoomCreateMode, RoomSnapshot } from "@here-to-slay/protocol";

export type Snapshot = RoomSnapshot;
export type Session = { roomCode: string; sessionToken: string; snapshot: Snapshot; receivedAt: number };
type ErrorBody = { ok: false; error: { code: string; message: string } };
export type CommandOutcome = { accepted: boolean; code: string; replayed: boolean };
type CommandResponse = { outcome: CommandOutcome; snapshot: Snapshot };
const key = "hts.reaction.session";
const publicBase = import.meta.env.BASE_URL.replace(/\/$/, "");
async function request<T extends object>(path: string, init: RequestInit = {}): Promise<T> { const response = await fetch(`${publicBase}${path}`, init); const body = await response.json() as T | ErrorBody; if (!response.ok) throw new Error("error" in body ? `${body.error.code}: ${body.error.message}` : "Connection failed."); return body as T; }
type SessionResponse = Omit<Session, "receivedAt">;
export const createRoom = async (nickname: string, mode: RoomCreateMode = "base") => ({ ...(await request<SessionResponse>("/api/rooms", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ nickname, mode }) })), receivedAt: Date.now() });
export const joinRoom = async (roomCode: string, nickname: string) => ({ ...(await request<SessionResponse>(`/api/rooms/${encodeURIComponent(roomCode)}/join`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ nickname }) })), receivedAt: Date.now() });
export const snapshot = (roomCode: string, token: string) => request<{ snapshot: Snapshot }>(`/api/rooms/${encodeURIComponent(roomCode)}/snapshot`, { headers: { authorization: `Bearer ${token}` } });
export const command = (roomCode: string, token: string, commandId: string, expectedRevision: number, kind: string, payload: object) => request<CommandResponse>(`/api/rooms/${encodeURIComponent(roomCode)}/commands`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body: JSON.stringify({ commandId, expectedRevision, kind, payload }) });
/**
 * Rooms live at /herotoslay/<ROOM>/<playerId> (owner 2026-11-04), so one browser can sit in several
 * rooms at once (one tab each) and a refresh / shared link lands on the right seat. The session token
 * never goes in the URL: it is kept per room+player in localStorage.
 */
const sessionsKey = "hts.sessions.v1";
const SESSION_TTL_MS = 6 * 3600_000;
export type RoutePath = { roomCode: string | null; playerId: string | null };
export const parseRoute = (): RoutePath => {
  const path = location.pathname.startsWith(publicBase) ? location.pathname.slice(publicBase.length) : location.pathname;
  const [room, player] = path.split("/").filter(Boolean);
  return { roomCode: room && /^[A-Za-z0-9]{6}$/.test(room) ? room.toUpperCase() : null, playerId: room && player ? decodeURIComponent(player) : null };
};
const routeUrl = (roomCode: string | null, playerId?: string | null) => `${publicBase}/${roomCode ? `${roomCode}${playerId ? `/${encodeURIComponent(playerId)}` : ""}` : ""}${location.search}`;
type Store = Record<string, Session>;
const readStore = (): Store => { try { const raw = localStorage.getItem(sessionsKey); const all = raw ? JSON.parse(raw) as Store : {}; const now = Date.now(); return Object.fromEntries(Object.entries(all).filter(([, value]) => now - value.receivedAt < SESSION_TTL_MS)); } catch { return {}; } };
const writeStore = (store: Store) => { try { localStorage.setItem(sessionsKey, JSON.stringify(store)); } catch { /* storage unavailable: the session just won't survive a reload */ } };
const sessionKey = (roomCode: string, playerId: string) => `${roomCode.toUpperCase()}/${playerId}`;
export const loadSession = (): Session | null => { const route = parseRoute(); return route.roomCode && route.playerId ? readStore()[sessionKey(route.roomCode, route.playerId)] ?? null : null; };
export const saveSession = (value: Session) => {
  const playerId = value.snapshot.you.playerId;
  const store = readStore(); store[sessionKey(value.roomCode, playerId)] = value; writeStore(store);
  const target = routeUrl(value.roomCode.toUpperCase(), playerId);
  if (`${location.pathname}${location.search}` !== target) history.replaceState(null, "", target);
};
export const clearSession = (value?: Session | null) => {
  const route = parseRoute();
  const roomCode = value?.roomCode ?? route.roomCode; const playerId = value?.snapshot.you.playerId ?? route.playerId;
  if (roomCode && playerId) { const store = readStore(); delete store[sessionKey(roomCode, playerId)]; writeStore(store); }
  history.replaceState(null, "", routeUrl(null));
};
export const leaveRoom = (roomCode: string, token: string) => request<{ ok: true }>(`/api/rooms/${encodeURIComponent(roomCode)}/leave`, { method: "POST", headers: { authorization: `Bearer ${token}` } }).catch(() => undefined);
