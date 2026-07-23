import { trpcServer } from "@hono/trpc-server";
import { createContext } from "@nova/api/context";
import { appRouter } from "@nova/api/routers/index";
import { auth } from "@nova/auth";
import { env } from "@nova/env/server";
import { initLogger } from "evlog";
import {
  type BetterAuthInstance,
  createAuthMiddleware,
} from "evlog/better-auth";
import { type EvlogVariables, evlog } from "evlog/hono";
import { Hono } from "hono";
import { cors } from "hono/cors";

initLogger({
  env: { service: "nova-server" },
});

const identifyUser = createAuthMiddleware(auth as BetterAuthInstance, {
  exclude: ["/api/auth/**"],
  maskEmail: true,
});

const app = new Hono<EvlogVariables>();

app.use(evlog());
app.use("*", async (c, next) => {
  await identifyUser(c.get("log"), c.req.raw.headers, c.req.path);
  await next();
});

app.use(
  "/*",
  cors({
    allowHeaders: ["Content-Type", "Authorization"],
    allowMethods: ["GET", "POST", "OPTIONS"],
    credentials: true,
    origin: env.CORS_ORIGIN,
  })
);

app.on(["POST", "GET"], "/api/auth/*", (c) => auth.handler(c.req.raw));

const nativeAppUrl = "nova://";
const allowedNativeProtocols = new Set([
  "exp:",
  new URL(nativeAppUrl).protocol,
]);

app.get("/polar/success", (c) => {
  const requestUrl = new URL(c.req.url);
  const returnUrl = requestUrl.searchParams.get("returnUrl") || nativeAppUrl;

  let redirectUrl: URL;
  try {
    redirectUrl = new URL(returnUrl);
  } catch {
    return c.text("Invalid return URL", 400);
  }

  if (!allowedNativeProtocols.has(redirectUrl.protocol)) {
    return c.text("Invalid return URL", 400);
  }

  return c.redirect(redirectUrl.toString(), 302);
});

app.use(
  "/trpc/*",
  trpcServer({
    createContext: (_opts, context) => createContext({ context }),
    router: appRouter,
  })
);

app.get("/", (c) => c.text("OK"));

export default app;
