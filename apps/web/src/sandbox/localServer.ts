// Sandbox build only (vite.sandbox.config.ts): the real Worker router + Durable Object run inside the
// page, so the whole game (rules, bots, timers) is playable with no server. Same code as production;
// only the transport differs: `fetch("…/api/…")` is answered in memory instead of over the network.
// State lives in this tab's memory: reloading the page starts over.
import { RoomDurableObject, type DurableObjectContextLike, type DurableObjectStorageLike, type DurableObjectTransactionLike } from "../../../worker/src/room.ts";
import { routeRequest, type WorkerEnv } from "../../../worker/src/router.ts";

class MemoryStorage implements DurableObjectStorageLike, DurableObjectTransactionLike {
  private readonly values = new Map<string, unknown>();
  private tail: Promise<unknown> = Promise.resolve();
  async get<T>(key: string): Promise<T | undefined> { return structuredClone(this.values.get(key)) as T | undefined; }
  async put<T>(key: string, value: T): Promise<void> { this.values.set(key, structuredClone(value)); }
  // Alarms are not needed here: the page polls its snapshot every second, which settles deadlines and bots.
  async setAlarm(): Promise<void> {}
  transaction<T>(callback: (txn: DurableObjectTransactionLike) => Promise<T>): Promise<T> {
    const result = this.tail.then(() => callback(this));
    this.tail = result.then(() => undefined, () => undefined);
    return result;
  }
}

const rooms = new Map<string, RoomDurableObject>();
const env = {
  ROOMS: {
    idFromName: (name: string) => name,
    get(roomId: unknown) {
      const code = String(roomId);
      let room = rooms.get(code);
      if (!room) {
        const context: DurableObjectContextLike = { storage: new MemoryStorage(), blockConcurrencyWhile: async <T>(cb: () => Promise<T>) => cb() };
        rooms.set(code, (room = new RoomDurableObject(context)));
      }
      const current = room;
      return { fetch: (request: Request) => current.fetch(request) };
    },
  },
} satisfies WorkerEnv;

const network = window.fetch.bind(window);
window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const raw = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  const url = new URL(raw, location.href);
  const at = url.pathname.indexOf("/api/");
  if (at < 0) return network(input, init);
  const headers = new Headers(init?.headers);
  headers.set("cf-connecting-ip", "sandbox");
  return routeRequest(new Request(`https://sandbox.local${url.pathname.slice(at)}${url.search}`, { method: init?.method ?? "GET", headers, body: init?.body ?? undefined }), env);
};

const badge = document.createElement("div");
badge.textContent = "SANDBOX · chạy ngay trong trình duyệt, không có server · tải lại trang = ván mới";
badge.style.cssText = "position:fixed;left:50%;bottom:0;transform:translateX(-50%);z-index:9999;padding:2px 10px;font:700 11px/1.5 system-ui,sans-serif;color:#142336;background:#ffc31d;border:2px solid #142336;border-bottom:0;pointer-events:none;white-space:nowrap";
document.body.appendChild(badge);
