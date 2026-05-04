import * as React from "react";

const STORAGE_KEY = "selectedProjectId";

type SelectedProjectContextValue = {
  projectId: number | null;
  setProjectId: (id: number | null) => void;
};

const SelectedProjectContext =
  React.createContext<SelectedProjectContextValue | null>(null);

function readPersisted(): number | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

export function SelectedProjectProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [projectId, setProjectIdState] = React.useState<number | null>(null);

  React.useEffect(() => {
    setProjectIdState(readPersisted());
  }, []);

  const setProjectId = React.useCallback((id: number | null) => {
    setProjectIdState(id);
    if (typeof window !== "undefined") {
      if (id === null) window.localStorage.removeItem(STORAGE_KEY);
      else window.localStorage.setItem(STORAGE_KEY, String(id));
    }
  }, []);

  const value = React.useMemo(
    () => ({ projectId, setProjectId }),
    [projectId, setProjectId],
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
