import { FastifyRequest, FastifyReply } from "fastify";

// Build the set of allowed origins for the no-API-key CORS check. Localhost
// and 127.0.0.1 are always allowed (matches the user opening the UI on the
// same machine). Additional origins can be added via the ALLOWED_ORIGINS
// env var (comma-separated, e.g. "http://10.0.0.5:3456,http://192.168.1.10:3456")
// so users on a LAN can reach the UI without setting an API key.
function buildAllowedOrigins(config: any): string[] {
  const port = config.PORT || 3456;
  const defaults = [
    `http://127.0.0.1:${port}`,
    `http://localhost:${port}`,
  ];
  const extra = process.env.ALLOWED_ORIGINS;
  if (!extra) return defaults;
  return [
    ...defaults,
    ...extra
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0),
  ];
}

export const apiKeyAuth =
  (config: any) =>
  async (req: FastifyRequest, reply: FastifyReply, done: () => void) => {
    // Public endpoints that don't require authentication
    const publicPaths = ["/", "/health"];
    if (publicPaths.includes(req.url) || req.url.startsWith("/ui")) {
      return done();
    }

    // Check if Providers is empty or not configured
    const providers = config.Providers || config.providers || [];
    if (!providers || providers.length === 0) {
      // No providers configured, skip authentication
      return done();
    }

    const apiKey = config.APIKEY;
    if (!apiKey) {
      // If no API key is set, gate the API by origin. See
      // buildAllowedOrigins above for how the allowlist is built.
      const allowedOrigins = buildAllowedOrigins(config);
      const requestOrigin = req.headers.origin;
      if (requestOrigin && !allowedOrigins.includes(requestOrigin)) {
        reply.status(403).send(
          `CORS not allowed for this origin. Set ALLOWED_ORIGINS env var to a comma-separated list of allowed origins, or set APIKEY in config.json.`,
        );
        return;
      }
      if (requestOrigin && allowedOrigins.includes(requestOrigin)) {
        reply.header('Access-Control-Allow-Origin', requestOrigin);
      }
      return done();
    }

    const authHeaderValue =
      req.headers.authorization || req.headers["x-api-key"];
    const authKey: string = Array.isArray(authHeaderValue)
      ? authHeaderValue[0]
      : authHeaderValue || "";
    if (!authKey) {
      reply.status(401).send("APIKEY is missing");
      return;
    }
    let token = "";
    if (authKey.startsWith("Bearer")) {
      token = authKey.split(" ")[1];
    } else {
      token = authKey;
    }

    if (token !== apiKey) {
      reply.status(401).send("Invalid API key");
      return;
    }

    done();
  };
