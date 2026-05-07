import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { FefRow } from "~/lib/types";
import type { FefTableState } from "~/lib/table-utils";
import {
  fefRowsQueryOptions,
  saveFefRows,
  type FefSectionKey,
} from "~/utils/fefRows";

const SAVE_DEBOUNCE_MS = 500;

/**
 * Hydrates a FefTableState from the database on mount and persists subsequent
 * edits via debounced batch saves. No-op when projectId is null.
 *
 * If the DB has no rows for this (project, discipline, section), falls back
 * to `fallbackRows` (used by Support Labor to seed from CBS items).
 */
export function useFefRowPersistence({
  projectId,
  discipline,
  section,
  state,
  fallbackRows,
}: {
  projectId: number | null;
  discipline: string;
  section: FefSectionKey;
  state: FefTableState;
  fallbackRows?: FefRow[];
}) {
  const queryClient = useQueryClient();
  const queryOpts = fefRowsQueryOptions({ projectId, discipline, section });
  const { data: loadedRows } = useQuery(queryOpts);
  const { data, setData } = state;

  const fetchedKeyRef = React.useRef<string | null>(null);
  const hydratedKeyRef = React.useRef<string | null>(null);
  const saveTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentKey = `${projectId}|${discipline}|${section}`;

  React.useEffect(() => {
    console.log("[fef-persist] hydration tick", {
      currentKey,
      projectId,
      loadedRows: loadedRows === undefined ? "undefined" : loadedRows.length,
      fetched: fetchedKeyRef.current === currentKey,
      hydrated: hydratedKeyRef.current === currentKey,
    });
    if (projectId === null) return;
    if (loadedRows === undefined) return;

    fetchedKeyRef.current = currentKey;
    if (hydratedKeyRef.current === currentKey) return;

    if (loadedRows.length > 0) {
      console.log("[fef-persist] applying DB rows", currentKey, loadedRows.length);
      setData(loadedRows);
      hydratedKeyRef.current = currentKey;
    } else if (fallbackRows && fallbackRows.length > 0) {
      console.log("[fef-persist] applying fallback", currentKey, fallbackRows.length);
      setData(fallbackRows);
      hydratedKeyRef.current = currentKey;
    } else {
      console.log("[fef-persist] nothing to apply", currentKey);
    }
  }, [projectId, currentKey, loadedRows, fallbackRows, setData]);

  React.useEffect(() => {
    if (projectId === null) return;
    if (fetchedKeyRef.current !== currentKey) return;

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    const snapshot = data;
    saveTimerRef.current = setTimeout(() => {
      console.log("[fef-persist] firing save", currentKey, snapshot.length);
      saveFefRows({
        data: { projectId, discipline, section, rows: snapshot },
      })
        .then((saved) => {
          console.log("[fef-persist] save success", currentKey, saved.length);
          queryClient.setQueryData(
            ["fefRows", projectId, discipline, section],
            saved,
          );
        })
        .catch((err) => {
          console.error("[fef-persist] save failed", currentKey, err);
        });
    }, SAVE_DEBOUNCE_MS);

    // No cleanup: timer survives unmount so SPA nav doesn't lose pending saves.
    // Browser refresh will still drop pending saves — that's a separate concern.
  }, [projectId, discipline, section, currentKey, data, queryClient]);
}
