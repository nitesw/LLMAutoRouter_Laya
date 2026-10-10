import { UPSTREAM } from "./config";

// Hop-by-hop or recomputed headers that must not be copied between legs.
const DROP_REQUEST = ["host", "content-length", "connection", "accept-encoding"];
const DROP_RESPONSE = ["content-encoding", "content-length", "connection", "transfer-encoding"];

function copyHeaders(src: Headers, drop: string[]): Headers {
  const out = new Headers(src);
  for (const h of drop) out.delete(h);
  return out;
}

/** Send a request upstream with the caller's headers (auth passes through untouched). */
export function sendUpstream(req: Request, body?: BodyInit | null): Promise<Response> {
  const url = new URL(req.url);
  const target = new URL(url.pathname + url.search, process.env.UPSTREAM_URL ?? UPSTREAM);
  return fetch(target, {
    method: req.method,
    headers: copyHeaders(req.headers, DROP_REQUEST),
    body: body === undefined ? (["GET", "HEAD"].includes(req.method) ? undefined : req.body) : body,
    redirect: "manual",
  });
}

/** Stream an upstream response back unchanged (SSE included). */
export function relay(res: Response): Response {
  return new Response(res.body, {
    status: res.status,
    statusText: res.statusText,
    headers: copyHeaders(res.headers, DROP_RESPONSE),
  });
}

export async function passthrough(req: Request): Promise<Response> {
  return relay(await sendUpstream(req));
}
