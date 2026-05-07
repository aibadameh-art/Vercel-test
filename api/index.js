export const config = { runtime: "edge" };

const DEST_BASE = (process.env.TARGET_DOMAIN || "").replace(/\/$/, "");

const REMOVE_HEADERS = new Set([
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

export default async function handler(request) {
  if (!DEST_BASE) {
    return new Response("Misconfigured: TARGET_DOMAIN is not set", { status: 500 });
  }

  try {
    const slashIndex = request.url.indexOf("/", 8);
    const finalUrl =
      slashIndex === -1 ? DEST_BASE + "/" : DEST_BASE + request.url.slice(slashIndex);

    const cleanHeaders = new Headers();
    let originalIp = null;

    for (const [key, value] of request.headers) {
      if (REMOVE_HEADERS.has(key)) continue;
      if (key.startsWith("x-vercel-")) continue;
      if (key === "x-real-ip") {
        originalIp = value;
        continue;
      }
      if (key === "x-forwarded-for") {
        if (!originalIp) originalIp = value;
        continue;
      }
      cleanHeaders.set(key, value);
    }

    if (originalIp) cleanHeaders.set("x-forwarded-for", originalIp);

    const httpMethod = request.method;
    const supportsBody = httpMethod !== "GET" && httpMethod !== "HEAD";

    return await fetch(finalUrl, {
      method: httpMethod,
      headers: cleanHeaders,
      body: supportsBody ? request.body : undefined,
      duplex: "half",
      redirect: "manual",
    });

  } catch (error) {
    console.error("relay error:", error);
    return new Response("Bad Gateway: Tunnel Failed", { status: 502 });
  }
}
