import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { FefRow } from "~/lib/types";
import type { FefTableState } from "~/lib/table-utils";
import { useSelectedVersion } from "~/lib/selected-version";
import {
  fefRowsQueryOptions,
  saveFefRows,
  type FefSectionKey,
} from "~/utils/fefRows";
import { fefRowHasUserData } from "~/lib/fef-helpers";
import { logger } from "~/lib/logger";
import { qk } from "~/lib/query-keys";
import type { SaveStatus } from "~/components/SaveIndicator";

const SAVE_DEBOUNCE_MS = 500;

/** Stable default so the reset effect's dependency doesn't change each render. */
const NO_ROWS: FefRow[] = [];

/**
 * A signature of the *persistable* content of a grid — the exact rows
 * `saveFefRows` would write (blank template rows dropped), including their
 * order (position). Two grids with the same signature persist identically, so
 * comparing signatures lets the autosave fire only on meaningful changes and
 * ignore no-op churn: hydration setting the loaded rows, the reset-to-empty on
 * a key switch, and the trailing-blank auto-append all leave the signature
 * unchanged, so none of them trigger a redundant save (or the save →
 * setQueryData → re-hydrate cycle that redundant save can kick off).
 */
function persistableSignature(rows: FefRow[]): string {
  const persistable = rows.filter(
    (r) => !r.id.startsWith("__fe-blank-") || fefRowHasUserData(r),
  );
  return JSON.stringify(
    persistable.map((r) => {
      const { id, ...fields } = r;
      return [id.startsWith("__fe-blank-") ? "" : id, fields];
    }),
  );
}

/**
 * Hydrates a FefTableState from the database on mount and persists subsequent
 * edits via debounced batch saves. No-op when versionId is null.
 *
 * If the DB has no rows for this (version, discipline, section), falls back
 * to `fallbackRows` (used by Support Labor to seed from CBS items).
 */
export function useFefRowPersistence({
  versionId,
  discipline,
  section,
  state,
  fallbackRows,
  emptyRows = NO_ROWS,
}: {
  versionId: number | null;
  discipline: string;
  section: FefSectionKey;
  state: FefTableState;
  fallbackRows?: FefRow[];
  /** Rows to reset the grid to when the (version, discipline, section) key
   *  changes, before the new key's data hydrates. Defaults to empty; the Take
   *  Off passes a single blank row so the grid is never momentarily rowless. */
  emptyRows?: FefRow[];
}): { isLoading: boolean; saveStatus: SaveStatus; lastSavedAt: number | null } {
  const queryClient = useQueryClient();
  const { isHydrated: isVersionHydrated } = useSelectedVersion();
  const queryOpts = fefRowsQueryOptions({ versionId, discipline, section });
  const { data: loadedRows, isError: isLoadError } = useQuery(queryOpts);
  const { data, setData } = state;

  const hydratedKeyRef = React.useRef<string | null>(null);
  const skipNextSaveRef = React.useRef(false);
  // Signature of the last content we know is persisted (or was just loaded from
  // the DB) for the current key. The autosave compares against this so it only
  // fires on a real content change — see `persistableSignature`. `null` means
  // "not yet established for this key" (autosave is also gated on appliedKey).
  const lastSavedSigRef = React.useRef<string | null>(null);
  const saveTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentKey = `${versionId}|${discipline}|${section}`;

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
    if (!isVersionHydrated) return;
    if (versionId === null) {
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
      lastSavedSigRef.current = persistableSignature(loadedRows);
      startTransition(() => {
        setData(loadedRows);
        setAppliedKey(currentKey);
      });
      return;
    } else if (fallbackRows && fallbackRows.length > 0) {
      skipNextSaveRef.current = true;
      hydratedKeyRef.current = currentKey;
      // Fallback rows (e.g. CBS-seeded Support Labor) are a client-side seed
      // that must NOT be auto-persisted — treat them as the baseline so the
      // first save only fires once the user actually edits one of them.
      lastSavedSigRef.current = persistableSignature(fallbackRows);
      startTransition(() => {
        setData(fallbackRows);
        setAppliedKey(currentKey);
      });
      return;
    }
    // Nothing to apply (no saved rows). The persisted baseline is empty.
    lastSavedSigRef.current = persistableSignature([]);
    // If this key can never receive fallback rows (Take Off passes none), mark
    // it hydrated. Otherwise the first autosave's `setQueryData` makes
    // `loadedRows` non-empty and re-enters this effect via the loadedRows>0
    // branch — re-applying the just-saved rows over the user's in-progress edits
    // AND spinning up a deferred `startTransition` whose `isPending` keeps the
    // load mask up for as long as they keep typing. When fallback rows ARE
    // expected (Support Labor seeds from CBS), leave it unset so a later-arriving
    // fallback can still hydrate.
    if (!fallbackRows) {
      hydratedKeyRef.current = currentKey;
    }
    setAppliedKey(currentKey);
  }, [
    isVersionHydrated,
    versionId,
    currentKey,
    loadedRows,
    isLoadError,
    fallbackRows,
    setData,
  ]);

  React.useEffect(() => {
    if (versionId === null) return;
    if (appliedKey !== currentKey) return;
    if (skipNextSaveRef.current) {
      skipNextSaveRef.current = false;
      return;
    }
    // Only save when the *persistable* content actually changed. This ignores
    // the no-op churn that fires on every version switch — hydration applying
    // the loaded rows, the reset-to-empty, and the trailing-blank auto-append
    // all leave the signature unchanged — so switching versions no longer
    // triggers a redundant save (and the save → setQueryData → re-hydrate cycle
    // that redundant save could kick off). A real edit changes the signature.
    const sig = persistableSignature(data);
    if (sig === lastSavedSigRef.current) return;

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    const snapshot = data;
    // Edits made; a save is scheduled but not yet sent.
    setSaveStatus("pending");
    saveTimerRef.current = setTimeout(() => {
      setSaveStatus("saving");
      saveFefRows({
        data: { versionId, discipline, section, rows: snapshot },
      })
        .then((saved) => {
          lastSavedSigRef.current = sig;
          queryClient.setQueryData(
            ["fefRows", versionId, discipline, section],
            saved,
          );
          queryClient.invalidateQueries({
            queryKey: qk.projectFefRowTotals(versionId),
          });
          queryClient.invalidateQueries({
            queryKey: qk.invalidByDiscipline(versionId),
          });
          setSaveStatus("saved");
          setLastSavedAt(Date.now());
        })
        .catch((err) => {
          logger.error("fef-persist save failed", {
            currentKey,
            versionId,
            discipline,
            section,
            err,
          });
          setSaveStatus("error");
        });
    }, SAVE_DEBOUNCE_MS);

    // No cleanup: timer survives unmount so SPA nav doesn't lose pending saves.
    // Browser refresh will still drop pending saves — that's a separate concern.
  }, [versionId, discipline, section, currentKey, data, queryClient, appliedKey]);

  return {
    isLoading: isPending || appliedKey !== currentKey,
    saveStatus,
    lastSavedAt,
  };
}
