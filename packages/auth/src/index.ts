import { apiKey } from "@better-auth/api-key";
import { expo } from "@better-auth/expo";
import { createDb } from "@nova/db";
import {
  account,
  apikey,
  session,
  user,
  verification,
} from "@nova/db/schema/auth";
import { env } from "@nova/env/server";
import { checkout, polar, portal } from "@polar-sh/better-auth";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError, createAuthMiddleware } from "better-auth/api";

import { ALLOWED_SIGNUP_EMAIL } from "./lib/allowed-email";
import { polarClient } from "./lib/payments";

const RESTRICTED_ACCESS_MESSAGE = "Access is restricted.";

export function createAuth() {
  const db = createDb();

  return betterAuth({
    advanced: {
      database: {
        generateId: () => crypto.randomUUID(),
      },
      defaultCookieAttributes: {
        httpOnly: true,
        sameSite: "none",
        secure: true,
      },
    },
    baseURL: env.BETTER_AUTH_URL,
    database: drizzleAdapter(db, {
      provider: "pg",

      schema: { account, apikey, session, user, verification },
    }),
    emailAndPassword: {
      enabled: true,
    },
    hooks: {
      before: createAuthMiddleware((ctx) => {
        if (ctx.path !== "/sign-up/email" && ctx.path !== "/sign-in/email") {
          return Promise.resolve();
        }

        const email = ctx.body?.email;
        if (
          typeof email !== "string" ||
          email.toLowerCase() !== ALLOWED_SIGNUP_EMAIL.toLowerCase()
        ) {
          throw new APIError("BAD_REQUEST", {
            message: RESTRICTED_ACCESS_MESSAGE,
          });
        }

        return Promise.resolve();
      }),
    },
    plugins: [
      polar({
        client: polarClient,
        createCustomerOnSignUp: true,
        enableCustomerPortal: true,
        use: [
          checkout({
            authenticatedUsersOnly: true,
            products: [
              {
                productId: "your-product-id",
                slug: "pro",
              },
            ],
            successUrl: env.POLAR_SUCCESS_URL,
          }),
          portal(),
        ],
      }),
      expo(),
      apiKey({
        apiKeyHeaders: "nova-key",
        defaultPrefix: "NOVA_",
        keyExpiration: {
          disableCustomExpiresTime: true,
        },
        rateLimit: {
          enabled: false,
        },
      }),
    ],
    secret: env.BETTER_AUTH_SECRET,
    trustedOrigins: [
      env.CORS_ORIGIN,
      "nova://",
      "exp://",
      "http://localhost:8081",
    ],
  });
}

export const auth = createAuth();
