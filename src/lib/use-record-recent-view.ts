import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  recordRecentView,
  userRecentsQueryOptions,
} from "~/utils/userPreferences";
import type { RecentEntityType } from "~/config/recent-entities";

/**
 * Record "I opened this record" exactly once per mount of an entity dialog
 * body. Each of the five entity dialogs (Changelog / Fco / Rfi / Trend /
 * Pco) calls this with the slim list-item snapshot it already has — the
 * `EntityDialogShell` only mounts the body when the full record arrives,
 * so a single fire per dialog open is the right semantic.
 *
 * Passing `entry: null` (typical for the create / not-yet-loaded path) is a
 * no-op — the hook fires only when a record id is in hand.
 */
export function useRecordRecentView(
  entry: {
    entityType: RecentEntityType;
    entityId: number;
    projectId: number;
    number: string;
    title: string;
  } | null,
): void {
  const queryClient = useQueryClient();
  // useRef guards against React-strict-mode double-mounts firing the
  // mutation twice; once-per-actual-mount is the desired semantic.
  const fired = React.useRef(false);

  React.useEffect(() => {
    if (entry === null) return;
    if (fired.current) return;
    fired.current = true;
    // Fire-and-forget — failures don't surface to the user (recents is a
    // nice-to-have; a flake shouldn't pop a toast). Sentry catches anything
    // thrown via the global middleware if it matters.
    void recordRecentView({ data: entry }).then(() => {
      queryClient.invalidateQueries({
        queryKey: userRecentsQueryOptions().queryKey,
      });
    });
    // Intentionally do not depend on `entry` fields — the body remounts on
    // id change (the dialog shell keys on initial?.id), so a fresh hook
    // instance gets a fresh `fired` ref. This effect only needs to fire on
    // first mount with an entry present.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
