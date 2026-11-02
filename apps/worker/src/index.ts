import { routeRequest, type WorkerEnv } from "./router.ts";

export { RoomDurableObject } from "./room.ts";

export default {
  fetch(request: Request, env: WorkerEnv): Promise<Response> {
    return routeRequest(request, env);
  },
};
