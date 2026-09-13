import { isIP } from "node:net";

export function configureProxy(app, value = process.env.TRUST_PROXY_HOPS ?? "1") {
  if (!["0", "1"].includes(value)) throw new Error("TRUST_PROXY_HOPS must be exactly 0 or 1");
  const hops = Number(value);
  // Deployment has exactly one immediate trusted Traefik hop. Direct ports are private.
  app.set("trust proxy", hops === 1 ? 1 : false);
  app.use((req, res, next) => {
    if (hops === 0) {
      for (const name of ["x-forwarded-proto", "x-forwarded-host", "x-forwarded-for", "x-forwarded-port", "forwarded"]) delete req.headers[name];
      return next();
    }
    const proto = req.get("x-forwarded-proto");
    const host = req.get("x-forwarded-host");
    const forwardedFor = req.get("x-forwarded-for");
    // Express otherwise chooses the first forwarded value, even in a longer chain.
    if ((proto !== undefined && !/^(http|https)$/.test(proto)) ||
        (host !== undefined && host.toLowerCase() !== req.get("host")?.toLowerCase()) ||
        (forwardedFor !== undefined && !isIP(forwardedFor))) {
      return res.status(400).set("Cache-Control", "no-store").json({ error: "invalid_proxy_headers" });
    }
    // Host is authoritative for both our canonicalizer and React Router's adapter.
    delete req.headers["x-forwarded-host"];
    delete req.headers["x-forwarded-port"];
    delete req.headers.forwarded;
    next();
  });
}
