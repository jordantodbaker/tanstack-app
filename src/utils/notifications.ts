import { queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { resolveCurrentUser } from "./users.server";
import { parseIdInput } from "~/lib/validators";
import {
  countUnread,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "./notifications.server";

/**
 * CLIENT-SAFE. Mirrors the `users.ts` / `users.server.ts` split — all
 * server-only logic (prisma, recipient resolution) lives in the `.server`
 * module and is only reached through `createServerFn().handler()` bodies,
 * which TanStack Start strips from the client build.
 */

export type NotificationItem = {
  id: number;
  projectId: number | null;
  entityType: string;
  entityId: number;
  title: string;
  message: string;
  actorEmail: string;
  /** ISO timestamp when this notification was read, or null when unread. */
  readAt: string | null;
  createdAt: string;
};

async function requireUserId(): Promise<number | null> {
  const user = await resolveCurrentUser();
  return user?.id ?? null;
}

export const fetchNotifications = createServerFn({ method: "GET" }).handler(
  async (): Promise<NotificationItem[]> => {
    const userId = await requireUserId();
    if (userId === null) return [];
    return listNotifications(userId);
  },
);

export const fetchUnreadNotificationCount = createServerFn({
  method: "GET",
}).handler(async (): Promise<number> => {
  const userId = await requireUserId();
  if (userId === null) return 0;
  return countUnread(userId);
});

export const markNotificationReadFn = createServerFn({ method: "POST" })
  .inputValidator(parseIdInput)
  .handler(async ({ data }): Promise<{ ok: true }> => {
    const userId = await requireUserId();
    if (userId === null) throw new Error("Unauthorized: not signed in");
    await markNotificationRead(userId, data.id);
    return { ok: true };
  });

export const markAllNotificationsReadFn = createServerFn({
  method: "POST",
}).handler(async (): Promise<{ ok: true }> => {
  const userId = await requireUserId();
  if (userId === null) throw new Error("Unauthorized: not signed in");
  await markAllNotificationsRead(userId);
  return { ok: true };
});

export const notificationsQueryOptions = () =>
  queryOptions({
    queryKey: ["notifications"],
    queryFn: () => fetchNotifications(),
    staleTime: 30 * 1000,
  });

export const unreadNotificationCountQueryOptions = () =>
  queryOptions({
    queryKey: ["notifications", "unreadCount"],
    queryFn: () => fetchUnreadNotificationCount(),
    // Poll every 30s so the bell badge stays roughly current without a
    // websocket; tab focus also retriggers via React Query defaults.
    staleTime: 30 * 1000,
    refetchInterval: 30 * 1000,
    // Don't keep hammering the endpoint when the tab is in the background.
    // Returning to the tab triggers an immediate refetch via the default
    // `refetchOnWindowFocus`, so the badge catches up the instant the user
    // looks at it.
    refetchIntervalInBackground: false,
  });
