// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import type { Transition } from "~/utils/workflow";
import type { CurrentUser } from "~/utils/users";

// `useEntityWorkflow` reads the signed-in user via `useCurrentUser`; stub it so
// the hook runs without a QueryClient / auth.
const useCurrentUserMock = vi.hoisted(() => vi.fn());
vi.mock("~/lib/use-current-user", () => ({
  useCurrentUser: useCurrentUserMock,
}));

import { useEntityWorkflow } from "./use-entity-workflow";

type S = "DRAFT" | "SUBMITTED";
const TRANSITIONS: Record<S, Transition<S>[]> = {
  DRAFT: [{ action: "Submit", to: "SUBMITTED", minRole: "USER" }],
  SUBMITTED: [],
};

const user: CurrentUser = {
  id: 7,
  clerkId: "c7",
  email: "u@x.io",
  role: "USER",
};

const setCurrentUser = (u: CurrentUser | undefined) =>
  useCurrentUserMock.mockReturnValue({ data: u });

const record = (over: Partial<{ id: number; status: S; createdById: number | null }> = {}) => ({
  id: 1,
  status: "DRAFT" as S,
  createdById: null,
  ...over,
});

beforeEach(() => {
  setCurrentUser(user);
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("useEntityWorkflow — transitions", () => {
  it("offers available transitions when a transition handler is present", () => {
    const { result } = renderHook(() =>
      useEntityWorkflow({
        transitionMap: TRANSITIONS,
        initial: record(),
        onTransition: () => Promise.resolve(),
        setBusy: () => {},
        closeDialog: () => {},
      }),
    );
    expect(result.current.transitions.map((t) => t.action)).toEqual(["Submit"]);
  });

  it("offers no transitions without a transition handler", () => {
    const { result } = renderHook(() =>
      useEntityWorkflow({
        transitionMap: TRANSITIONS,
        initial: record(),
        onTransition: undefined,
        setBusy: () => {},
        closeDialog: () => {},
      }),
    );
    expect(result.current.transitions).toEqual([]);
  });

  it("flags the originator when the current user created the record", () => {
    const { result } = renderHook(() =>
      useEntityWorkflow({
        transitionMap: TRANSITIONS,
        initial: record({ createdById: user.id }),
        onTransition: () => Promise.resolve(),
        setBusy: () => {},
        closeDialog: () => {},
      }),
    );
    expect(result.current.isOriginator).toBe(true);
  });
});

describe("useEntityWorkflow — handlePromote", () => {
  it("confirms, promotes, then closes on accept", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const onPromote = vi.fn().mockResolvedValue(undefined);
    const setBusy = vi.fn();
    const closeDialog = vi.fn();

    const { result } = renderHook(() =>
      useEntityWorkflow({
        transitionMap: TRANSITIONS,
        initial: record({ id: 42 }),
        onTransition: () => Promise.resolve(),
        onPromote,
        promoteConfirmMessage: "Promote?",
        setBusy,
        closeDialog,
      }),
    );

    await act(async () => {
      await result.current.handlePromote();
    });

    expect(window.confirm).toHaveBeenCalledWith("Promote?");
    expect(onPromote).toHaveBeenCalledWith(42);
    expect(closeDialog).toHaveBeenCalledTimes(1);
    // Busy toggles on then off.
    expect(setBusy.mock.calls).toEqual([[true], [false]]);
  });

  it("aborts without promoting when the user cancels the confirm", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    const onPromote = vi.fn();
    const closeDialog = vi.fn();

    const { result } = renderHook(() =>
      useEntityWorkflow({
        transitionMap: TRANSITIONS,
        initial: record({ id: 42 }),
        onTransition: () => Promise.resolve(),
        onPromote,
        promoteConfirmMessage: "Promote?",
        setBusy: () => {},
        closeDialog,
      }),
    );

    await act(async () => {
      await result.current.handlePromote();
    });

    expect(onPromote).not.toHaveBeenCalled();
    expect(closeDialog).not.toHaveBeenCalled();
  });

  it("no-ops when there is no promote handler", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    const { result } = renderHook(() =>
      useEntityWorkflow({
        transitionMap: TRANSITIONS,
        initial: record({ id: 42 }),
        onTransition: () => Promise.resolve(),
        setBusy: () => {},
        closeDialog: () => {},
      }),
    );

    await act(async () => {
      await result.current.handlePromote();
    });

    // Bails on the missing handler before it ever prompts.
    expect(confirmSpy).not.toHaveBeenCalled();
  });
});
