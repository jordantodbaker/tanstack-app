import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { useSelectedProject } from "./selected-project";
import { versionsQueryOptions } from "~/utils/versions";

/**
 * Selected estimate version — mirrors `selected-project` (localStorage + cookie
 * for SSR loaders). The extra wrinkle vs. project selection is that the choice
 * must stay valid for the *current* project: when the project changes, or the
 * persisted version id belongs to a different project, this resolves to that
 * project's latest version. Version ids are globally unique, so a single
 * storage key is enough — a persisted id simply won't appear in another
 * project's version list, which triggers the fall back to latest.
 */

const STORAGE_KEY = "selectedVersionId";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 1 year

const SelectedVersionContext =
  React.createContext<SelectedVersionContextValue | null>(null);

type SelectedVersionContextValue = {
  versionId: number | null;
  setVersionId: (id: number | null) => void;
  isHydrated: boolean;
};

function readPersisted(): number | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function writeStorage(id: number | null): void {
  if (typeof window !== "undefined") {
    if (id === null) window.localStorage.removeItem(STORAGE_KEY);
    else window.localStorage.setItem(STORAGE_KEY, String(id));
  }
  if (typeof document === "undefined") return;
  if (id === null) {
    document.cookie = `${STORAGE_KEY}=; max-age=0; path=/; SameSite=Lax`;
  } else {
    document.cookie = `${STORAGE_KEY}=${id}; max-age=${COOKIE_MAX_AGE}; path=/; SameSite=Lax`;
  }
}

export function SelectedVersionProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { projectId } = useSelectedProject();
  const [versionId, setVersionIdState] = React.useState<number | null>(null);
  const [isHydrated, setIsHydrated] = React.useState(false);

  React.useEffect(() => {
    setVersionIdState(readPersisted());
    setIsHydrated(true);
  }, []);

  const setVersionId = React.useCallback((id: number | null) => {
    setVersionIdState(id);
    writeStorage(id);
  }, []);

  // The versions available for the selected project. Shares its cache entry
  // with the VersionSelect dropdown (same query options).
  const { data: versions } = useQuery(versionsQueryOptions(projectId));

  // Read the current versionId through a ref so the resolver effect below does
  // NOT re-run when it sets versionId (that would be a setState-in-effect loop).
  const versionIdRef = React.useRef(versionId);
  versionIdRef.current = versionId;
  // Remember which (project + version-list) we last auto-resolved, so we snap to
  // "latest" at most once per list — even if React Query hands back a new array
  // reference each render (which would otherwise re-run this effect forever).
  const resolvedSignatureRef = React.useRef<string | null>(null);

  // Keep the selection valid for the current project: if the persisted/current
  // version isn't in this project's list, snap to the latest (highest number).
  React.useEffect(() => {
    if (!isHydrated) return;
    if (projectId === null) {
      resolvedSignatureRef.current = null;
      if (versionIdRef.current !== null) setVersionId(null);
      return;
    }
    if (!versions || versions.length === 0) return;
    const signature = `${projectId}:${versions.map((v) => v.id).join(",")}`;
    const current = versionIdRef.current;
    const stillValid = current !== null && versions.some((v) => v.id === current);
    if (stillValid) {
      resolvedSignatureRef.current = signature;
      return;
    }
    // Already snapped to latest for this exact list — don't fire again (the
    // guard against a fresh-array-every-render infinite loop).
    if (resolvedSignatureRef.current === signature) return;
    resolvedSignatureRef.current = signature;
    // versions come back ordered by versionNumber asc — latest is last.
    setVersionId(versions[versions.length - 1].id);
  }, [projectId, versions, isHydrated, setVersionId]);

  const value = React.useMemo(
    () => ({ versionId, setVersionId, isHydrated }),
    [versionId, setVersionId, isHydrated],
  );

  return (
    <SelectedVersionContext.Provider value={value}>
      {children}
    </SelectedVersionContext.Provider>
  );
}

export function useSelectedVersion(): SelectedVersionContextValue {
  const ctx = React.useContext(SelectedVersionContext);
  if (!ctx) {
    throw new Error(
      "useSelectedVersion must be used within SelectedVersionProvider",
    );
  }
  return ctx;
}
