import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Bell } from "lucide-react";
import {
  markAllNotificationsReadFn,
  markNotificationReadFn,
  notificationsQueryOptions,
  unreadNotificationCountQueryOptions,
  type NotificationItem,
} from "~/utils/notifications";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "~/components/ui/popover";
import { Button } from "~/components/ui/button";
import { QueryError } from "~/components/ui/list-page";

/**
 * Header bell + dropdown inbox. Driven by workflow transitions emitted from
 * `notifications.server.ts`. Clicking a notification marks it read and
 * navigates to the relevant list page; the user opens the row from there.
 */
export function NotificationBell() {
  const [open, setOpen] = React.useState(false);
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const { data: unreadCount = 0 } = useQuery(
    unreadNotificationCountQueryOptions(),
  );
  // Only fetch the list when the popover is open so we don't churn the cache
  // on every page load.
  const {
    data: notifications = [],
    isPending,
    isError,
    error,
  } = useQuery({
    ...notificationsQueryOptions(),
    enabled: open,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["notifications"] });
  };

  const markRead = useMutation({
    mutationFn: (id: number) => markNotificationReadFn({ data: { id } }),
    onSuccess: invalidate,
  });
  const markAllRead = useMutation({
    mutationFn: () => markAllNotificationsReadFn(),
    onSuccess: invalidate,
  });

  function handleClick(n: NotificationItem) {
    if (n.readAt === null) markRead.mutate(n.id);
    setOpen(false);
    if (n.entityType === "ChangeLog") {
      void navigate({ to: "/changelog" });
    } else if (n.entityType === "FieldChangeOrder") {
      void navigate({ to: "/fco-log" });
    }
  }

  const badge = unreadCount > 9 ? "9+" : String(unreadCount);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={
            unreadCount > 0
              ? `Notifications, ${unreadCount} unread`
              : "Notifications"
          }
          className="relative flex h-9 w-9 items-center justify-center rounded-md text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-colors"
        >
          <Bell size={18} />
          {unreadCount > 0 && (
            <span className="absolute top-1 right-1 inline-flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-semibold leading-none text-white">
              {badge}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[calc(100vw-1rem)] sm:w-96 max-h-112 overflow-y-auto p-0">
        <div className="flex items-center justify-between border-b border-slate-200 px-3 py-2">
          <span className="text-sm font-semibold text-slate-800">
            Notifications
          </span>
          <Button
            variant="ghost"
            size="sm"
            disabled={unreadCount === 0 || markAllRead.isPending}
            onClick={() => markAllRead.mutate()}
            className="text-xs"
          >
            Mark all read
          </Button>
        </div>
        {isError ? (
          <div className="px-3 py-3">
            <QueryError error={error} label="notifications" />
          </div>
        ) : isPending ? (
          <p className="px-3 py-6 text-center text-xs text-slate-400">
            Loading…
          </p>
        ) : notifications.length === 0 ? (
          <p className="px-3 py-6 text-center text-xs text-slate-500">
            No notifications yet.
          </p>
        ) : (
          <ul>
            {notifications.map((n) => (
              <NotificationRow
                key={n.id}
                notification={n}
                onClick={() => handleClick(n)}
              />
            ))}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}

function NotificationRow({
  notification,
  onClick,
}: {
  notification: NotificationItem;
  onClick: () => void;
}) {
  const unread = notification.readAt === null;
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className={`w-full text-left px-3 py-2 border-b border-slate-100 hover:bg-slate-50 transition-colors ${
          unread ? "bg-blue-50/40" : ""
        }`}
      >
        <div className="flex items-start gap-2">
          {unread && (
            <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-blue-600" />
          )}
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium text-slate-800">
              {notification.title}
            </div>
            <div className="truncate text-xs text-slate-600">
              {notification.message}
            </div>
            <div className="mt-0.5 text-[11px] text-slate-400">
              {notification.actorEmail
                ? `${notification.actorEmail} · `
                : ""}
              {formatRelative(notification.createdAt)}
            </div>
          </div>
        </div>
      </button>
    </li>
  );
}

function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  const diffSec = (Date.now() - then) / 1000;
  if (diffSec < 60) return "just now";
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  if (diffSec < 86400 * 7) return `${Math.floor(diffSec / 86400)}d ago`;
  return new Date(iso).toLocaleDateString();
}
