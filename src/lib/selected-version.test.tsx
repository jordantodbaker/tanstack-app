// @vitest-environment jsdom
import * as React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import type { EstimateVersionOption } from "~/utils/versions";

// Controllable inputs the mocks read on each render.
const h = vi.hoisted(() => ({
  projectId: null as number | null,
  versions: [] as EstimateVersionOption[],
}));

vi.mock("~/lib/selected-project", () => ({
  useSelectedProject: () => ({ projectId: h.projectId }),
}));

vi.mock("~/utils/versions", () => ({
  versionsQueryOptions: (projectId: number | null) => ({
    queryKey: ["versions", projectId],
  }),
}));

vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({ data: h.versions }),
}));

import {
  SelectedVersionProvider,
  useSelectedVersion,
} from "./selected-version";

const version = (id: number, versionNumber: number): EstimateVersionOption => ({
  id,
  versionNumber,
  name: "",
  description: "",
  parentVersionId: null,
  createdAt: "2026-01-01T00:00:00.000Z",
});

function wrapper({ children }: { children: React.ReactNode }) {
  return <SelectedVersionProvider>{children}</SelectedVersionProvider>;
}

describe("SelectedVersionProvider resolution", () => {
  beforeEach(() => {
    h.projectId = null;
    h.versions = [];
    window.localStorage.clear();
  });

  it("defaults to the latest version (highest number) for a project", () => {
    h.projectId = 1;
    // asc order — latest is last.
    h.versions = [version(10, 1), version(11, 2), version(12, 3)];
    const { result } = renderHook(() => useSelectedVersion(), { wrapper });
    expect(result.current.versionId).toBe(12);
  });

  it("snaps to the new project's latest when the persisted id doesn't belong to it", () => {
    h.projectId = 1;
    h.versions = [version(10, 1), version(11, 2)];
    const { result, rerender } = renderHook(() => useSelectedVersion(), {
      wrapper,
    });
    expect(result.current.versionId).toBe(11);

    // Switch project: a disjoint version set. The previously-selected id (11)
    // isn't present, so it resolves to the new latest (21).
    act(() => {
      h.projectId = 2;
      h.versions = [version(20, 1), version(21, 2)];
    });
    rerender();
    expect(result.current.versionId).toBe(21);
  });

  it("keeps the current selection when it's still valid for the project", () => {
    h.projectId = 1;
    h.versions = [version(10, 1), version(11, 2), version(12, 3)];
    const { result, rerender } = renderHook(() => useSelectedVersion(), {
      wrapper,
    });
    expect(result.current.versionId).toBe(12);

    act(() => result.current.setVersionId(10));
    rerender();
    // 10 is still in the list, so the resolver leaves it alone.
    expect(result.current.versionId).toBe(10);
  });
});
