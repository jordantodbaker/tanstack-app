import * as React from "react";

const STORAGE_KEY = "selectedProjectId";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 1 year

const SelectedProjectContext =
  React.createContext<SelectedProjectContextValue | null>(null);

type SelectedProjectContextValue = {
  projectId: number | null;
  setProjectId: (id: number | null) => void;
  isHydrated: boolean;
};

function readPersisted(): number | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function writeCookie(id: number | null): void {
  if (typeof document === "undefined") return;
  if (id === null) {
    document.cookie = `${STORAGE_KEY}=; max-age=0; path=/; SameSite=Lax`;
  } else {
    document.cookie = `${STORAGE_KEY}=${id}; max-age=${COOKIE_MAX_AGE}; path=/; SameSite=Lax`;
  }
}

export function SelectedProjectProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [projectId, setProjectIdState] = React.useState<number | null>(null);
  const [isHydrated, setIsHydrated] = React.useState(false);

  React.useEffect(() => {
    const persisted = readPersisted();
    setProjectIdState(persisted);
    setIsHydrated(true);
    writeCookie(persisted);
  }, []);

  const setProjectId = React.useCallback((id: number | null) => {
    setProjectIdState(id);
    if (typeof window !== "undefined") {
      if (id === null) window.localStorage.removeItem(STORAGE_KEY);
      else window.localStorage.setItem(STORAGE_KEY, String(id));
    }
    writeCookie(id);
  }, []);

  const value = React.useMemo(
    () => ({ projectId, setProjectId, isHydrated }),
    [projectId, setProjectId, isHydrated],
  );

  return (
    <SelectedProjectContext.Provider value={value}>
      {children}
    </SelectedProjectContext.Provider>
  );
}

export function useSelectedProject(): SelectedProjectContextValue {
  const ctx = React.useContext(SelectedProjectContext);
  if (!ctx) {
    throw new Error(
      "useSelectedProject must be used within SelectedProjectProvider",
    );
  }
  return ctx;
}
