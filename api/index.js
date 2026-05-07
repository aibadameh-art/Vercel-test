export const config = { runtime: "edge" };

const UPSTREAM_BASE = (process.env.TARGET_DOMAIN || "").replace(/\/$/, "");

const SKIP_HEADERS = new Set([
  "host",
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
  "forwarded",
  "x-forwarded-host",
  "x-forwarded-proto",
  "x-forwarded-port",
]);

export default async function handleRequest(incoming) {
  if (!UPSTREAM_BASE) {
    return new Response("Service not ready: missing upstream configuration", { status: 500 });
  }

  try {
    const slashPos = incoming.url.indexOf("/", 8);
    const fullPath = slashPos === -1 ? UPSTREAM_BASE + "/" : UPSTREAM_BASE + incoming.url.slice(slashPos);

    const outgoingHeaders = new Headers();
    let realClientIp = null;

    for (const [hName, hVal] of incoming.headers) {
      if (SKIP_HEADERS.has(hName)) continue;
      if (hName.startsWith("x-vercel-")) continue;
      if (hName === "x-real-ip") {
        realClientIp = hVal;
        continue;
      }
      if (hName === "x-forwarded-for") {
        if (!realClientIp) realClientIp = hVal;
        continue;
      }
      outgoingHeaders.set(hName, hVal);
    }

    if (realClientIp) outgoingHeaders.set("x-forwarded-for", realClientIp);

    const verb = incoming.method;
    const canHaveBody = verb !== "GET" && verb !== "HEAD";

    const upstreamResp = await fetch(fullPath, {
      method: verb,
      headers: outgoingHeaders,
      body: canHaveBody ? incoming.body : undefined,
      duplex: "half",
      redirect: "manual",
    });

    const cleanRespHeaders = new Headers(upstreamResp.headers);
    cleanRespHeaders.delete("via");
    cleanRespHeaders.delete("x-powered-by");
    cleanRespHeaders.delete("server");
    cleanRespHeaders.set("server", "cloudflare");

    return new Response(upstreamResp.body, {
      status: upstreamResp.status,
      statusText: upstreamResp.statusText,
      headers: cleanRespHeaders,
    });

  } catch (failure) {
    console.error("proxy failure:", failure);
    return new Response("Service Unavailable", { status: 502 });
  }
}
