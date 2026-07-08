import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { FefRow } from "~/lib/types";
import type { FefTableState } from "~/lib/table-utils";
import { useSelectedProject } from "~/lib/selected-project";
import {
  fefRowsQueryOptions,
  saveFefRows,
  type FefSectionKey,
} from "~/utils/fefRows";
import { logger } from "~/lib/logger";
import { qk } from "~/lib/query-keys";
import type { SaveStatus } from "~/components/SaveIndicator";

const SAVE_DEBOUNCE_MS = 500;

/** Stable default so the reset effect's dependency doesn't change each render. */
const NO_ROWS: FefRow[] = [];

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
  emptyRows = NO_ROWS,
}: {
  projectId: number | null;
  discipline: string;
  section: FefSectionKey;
  state: FefTableState;
  fallbackRows?: FefRow[];
  /** Rows to reset the grid to when the (project, discipline, section) key
   *  changes, before the new key's data hydrates. Defaults to empty; the Take
   *  Off passes a single blank row so the grid is never momentarily rowless. */
  emptyRows?: FefRow[];
}): { isLoading: boolean; saveStatus: SaveStatus; lastSavedAt: number | null } {
  const queryClient = useQueryClient();
  const { isHydrated: isProjectHydrated } = useSelectedProject();
  const queryOpts = fefRowsQueryOptions({ projectId, discipline, section });
  const { data: loadedRows, isError: isLoadError } = useQuery(queryOpts);
  const { data, setData } = state;

  const hydratedKeyRef = React.useRef<string | null>(null);
  const skipNextSaveRef = React.useRef(false);
  const saveTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentKey = `${projectId}|${discipline}|${section}`;

  const [saveStatus, setSaveStatus] = React.useState<SaveStatus>("idle");
  const [lastSavedAt, setLastSavedAt] = React.useState<number | null>(null);

  const [appliedKey, setAppliedKey] = React.useState<string | null>(null);
  const [isPending, startTransition] = React.useTransition();

  // Whenever the (project, discipline, section) key changes, drop any rows left
  // over from the previously-selected key so they're neither shown nor
  // autosaved into the new one. The hydration effect below refills from the DB
  // (or `fallbackRows`) once the query for the new key settles; until then the
  // grid shows this clean slate behind the load mask. Keyed on `currentKey`
  // only (emptyRows read through a ref) so a mere query refetch never wipes
  // in-progress edits.
  const emptyRowsRef = React.useRef(emptyRows);
  emptyRowsRef.current = emptyRows;
  React.useEffect(() => {
    skipNextSaveRef.current = true;
    setData(emptyRowsRef.current);
  }, [currentKey, setData]);

  React.useEffect(() => {
    if (!isProjectHydrated) return;
    if (projectId === null) {
      setAppliedKey(currentKey);
      return;
    }
    if (loadedRows === undefined) {
      // Errored queries also have `data === undefined`. Treat that as
      // "settled, nothing to apply" so the LoadMask hides — the page
      // boundary (ProjectGuard / route loader) handles real no-access.
      if (isLoadError) setAppliedKey(currentKey);
      return;
    }
    if (hydratedKeyRef.current === currentKey) {
      setAppliedKey(currentKey);
      return;
    }

    if (loadedRows.length > 0) {
      skipNextSaveRef.current = true;
      hydratedKeyRef.current = currentKey;
      startTransition(() => {
        setData(loadedRows);
        setAppliedKey(currentKey);
      });
      return;
    } else if (fallbackRows && fallbackRows.length > 0) {
      skipNextSaveRef.current = true;
      hydratedKeyRef.current = currentKey;
      startTransition(() => {
        setData(fallbackRows);
        setAppliedKey(currentKey);
      });
      return;
    }
    // Nothing to apply. Mark "checked" so the mask hides and saves can fire,
    // but leave hydratedKeyRef unset so a later-arriving fallbackRows (e.g.
    // deferred query) can still hydrate.
    setAppliedKey(currentKey);
  }, [
    isProjectHydrated,
    projectId,
    currentKey,
    loadedRows,
    isLoadError,
    fallbackRows,
    setData,
  ]);

  React.useEffect(() => {
    if (projectId === null) return;
    if (appliedKey !== currentKey) return;
    if (skipNextSaveRef.current) {
      skipNextSaveRef.current = false;
      return;
    }

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    const snapshot = data;
    // Edits made; a save is scheduled but not yet sent.
    setSaveStatus("pending");
    saveTimerRef.current = setTimeout(() => {
      setSaveStatus("saving");
      saveFefRows({
        data: { projectId, discipline, section, rows: snapshot },
      })
        .then((saved) => {
          queryClient.setQueryData(
            ["fefRows", projectId, discipline, section],
            saved,
          );
          queryClient.invalidateQueries({
            queryKey: qk.projectFefRowTotals(projectId),
          });
          queryClient.invalidateQueries({
            queryKey: qk.invalidByDiscipline(projectId),
          });
          setSaveStatus("saved");
          setLastSavedAt(Date.now());
        })
        .catch((err) => {
          logger.error("fef-persist save failed", {
            currentKey,
            projectId,
            discipline,
            section,
            err,
          });
          setSaveStatus("error");
        });
    }, SAVE_DEBOUNCE_MS);

    // No cleanup: timer survives unmount so SPA nav doesn't lose pending saves.
    // Browser refresh will still drop pending saves — that's a separate concern.
  }, [projectId, discipline, section, currentKey, data, queryClient, appliedKey]);

  return {
    isLoading: isPending || appliedKey !== currentKey,
    saveStatus,
    lastSavedAt,
  };
}
