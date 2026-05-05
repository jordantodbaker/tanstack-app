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

  const hydratedKeyRef = React.useRef<string | null>(null);
  const skipNextSaveRef = React.useRef(false);
  const saveTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentKey = `${projectId}|${discipline}|${section}`;

  React.useEffect(() => {
    if (projectId === null) return;
    if (loadedRows === undefined) return;
    if (hydratedKeyRef.current === currentKey) return;

    skipNextSaveRef.current = true;
    if (loadedRows.length > 0) {
      setData(loadedRows);
    } else if (fallbackRows && fallbackRows.length > 0) {
      setData(fallbackRows);
    }
    hydratedKeyRef.current = currentKey;
  }, [projectId, currentKey, loadedRows, fallbackRows, setData]);

  React.useEffect(() => {
    if (projectId === null) return;
    if (hydratedKeyRef.current !== currentKey) return;
    if (skipNextSaveRef.current) {
      skipNextSaveRef.current = false;
      return;
    }

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    const snapshot = data;
    saveTimerRef.current = setTimeout(() => {
      saveFefRows({
        data: { projectId, discipline, section, rows: snapshot },
      })
        .then(() => {
          queryClient.setQueryData(
            queryOpts.queryKey,
            snapshot.filter((r) => !r.id.startsWith("__fe-blank-")),
          );
        })
        .catch((err) => {
          console.error("Failed to save FEF rows", err);
        });
    }, SAVE_DEBOUNCE_MS);

    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [
    projectId,
    discipline,
    section,
    currentKey,
    data,
    queryClient,
    queryOpts.queryKey,
  ]);
}
