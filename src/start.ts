// Must run before anything else so Sentry is initialized in this (server) bundle's
// module realm before the middleware below references it.
import "./instrument.server";
import { clerkMiddleware } from "@clerk/tanstack-react-start/server";
import {
  sentryGlobalFunctionMiddleware,
  sentryGlobalRequestMiddleware,
} from "@sentry/tanstackstart-react";
import { createStart } from "@tanstack/react-start";

export const startInstance = createStart(() => {
  return {
    // `sentryGlobalRequestMiddleware` captures SSR / loader errors per request;
    // `sentryGlobalFunctionMiddleware` captures throws inside every `createServerFn`
    // handler (upsert / transition / delete …) — the app's real error surface.
    requestMiddleware: [sentryGlobalRequestMiddleware, clerkMiddleware()],
    functionMiddleware: [sentryGlobalFunctionMiddleware],
  };
});
