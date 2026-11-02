import type { RoomCreateMode, RoomSliceSnapshot } from "@here-to-slay/protocol";

export type Snapshot = RoomSliceSnapshot;
export type Session = { roomCode: string; sessionToken: string; snapshot: Snapshot; receivedAt: number };
type ErrorBody = { ok: false; error: { code: string; message: string } };
export type CommandOutcome = { accepted: boolean; code: string; replayed: boolean };
type CommandResponse = { outcome: CommandOutcome; snapshot: Snapshot };
const key = "hts.reaction.session";
async function request<T extends object>(path: string, init: RequestInit = {}): Promise<T> { const response = await fetch(path, init); const body = await response.json() as T | ErrorBody; if (!response.ok) throw new Error("error" in body ? `${body.error.code}: ${body.error.message}` : "Connection failed."); return body as T; }
type SessionResponse = Omit<Session, "receivedAt">;
export const createRoom = async (nickname: string, mode: RoomCreateMode = "reaction_demo") => ({ ...(await request<SessionResponse>("/api/rooms", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ nickname, mode }) })), receivedAt: Date.now() });
export const joinRoom = async (roomCode: string, nickname: string) => ({ ...(await request<SessionResponse>(`/api/rooms/${encodeURIComponent(roomCode)}/join`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ nickname }) })), receivedAt: Date.now() });
export const snapshot = (roomCode: string, token: string) => request<{ snapshot: Snapshot }>(`/api/rooms/${encodeURIComponent(roomCode)}/snapshot`, { headers: { authorization: `Bearer ${token}` } });
export const command = (roomCode: string, token: string, commandId: string, expectedRevision: number, kind: string, payload: object) => request<CommandResponse>(`/api/rooms/${encodeURIComponent(roomCode)}/commands`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body: JSON.stringify({ commandId, expectedRevision, kind, payload }) });
export const loadSession = (): Session | null => { try { const raw = sessionStorage.getItem(key); return raw ? JSON.parse(raw) as Session : null; } catch { return null; } };
export const saveSession = (value: Session) => sessionStorage.setItem(key, JSON.stringify(value));
export const clearSession = () => sessionStorage.removeItem(key);
