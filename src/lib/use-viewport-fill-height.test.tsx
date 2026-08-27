// @vitest-environment jsdom
import * as React from "react";
import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import {
  computeFillHeight,
  useViewportFillHeight,
} from "./use-viewport-fill-height";

describe("computeFillHeight", () => {
  it("fills the gap between the pane's top and the viewport bottom", () => {
    expect(
      computeFillHeight({ top: 200, viewportHeight: 900, reserve: 100, min: 240 }),
    ).toBe(600);
  });

  it("subtracts the reserve so what sits below the pane stays visible", () => {
    const withoutReserve = computeFillHeight({
      top: 200,
      viewportHeight: 900,
      reserve: 0,
      min: 0,
    });
    const withReserve = computeFillHeight({
      top: 200,
      viewportHeight: 900,
      reserve: 116,
      min: 0,
    });
    expect(withoutReserve - withReserve).toBe(116);
  });

  it("clamps to the minimum on a short viewport", () => {
    // A laptop with the browser chrome and page header eating most of the
    // screen would otherwise compute a pane a few pixels tall.
    expect(
      computeFillHeight({ top: 700, viewportHeight: 760, reserve: 116, min: 240 }),
    ).toBe(240);
  });

  it("clamps rather than returning a negative height", () => {
    expect(
      computeFillHeight({ top: 900, viewportHeight: 600, reserve: 100, min: 240 }),
    ).toBe(240);
  });

  it("rounds to whole pixels", () => {
    expect(
      computeFillHeight({ top: 100.4, viewportHeight: 900, reserve: 0, min: 0 }),
    ).toBe(800);
  });
});

/** Records the observers created so tests can fire them by hand. */
let observers: { cb: () => void; disconnect: ReturnType<typeof vi.fn> }[] = [];

beforeEach(() => {
  observers = [];
  // jsdom has no ResizeObserver.
  vi.stubGlobal(
    "ResizeObserver",
    class {
      disconnect = vi.fn();
      constructor(private cb: () => void) {
        observers.push({ cb, disconnect: this.disconnect });
      }
      observe() {}
      unobserve() {}
    },
  );
  window.innerHeight = 900;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/** Mounts the hook against a div whose top edge is fixed at `top`. */
function renderAt(top: number, options = {}) {
  const el = document.createElement("div");
  document.body.appendChild(el);
  vi.spyOn(el, "getBoundingClientRect").mockImplementation(
    () => ({ top }) as DOMRect,
  );
  const ref = { current: el } as React.RefObject<HTMLElement | null>;
  return renderHook(() => useViewportFillHeight(ref, options));
}

describe("useViewportFillHeight", () => {
  it("measures the element on mount", () => {
    const { result } = renderAt(300, { reserve: 100, min: 240 });
    expect(result.current).toBe(500);
  });

  it("re-measures when the window resizes", () => {
    const { result } = renderAt(300, { reserve: 100, min: 240 });
    expect(result.current).toBe(500);

    act(() => {
      window.innerHeight = 700;
      window.dispatchEvent(new Event("resize"));
    });
    expect(result.current).toBe(300);
  });

  it("re-measures when chrome above the pane changes height", () => {
    // The find bar opening pushes the grid down; nothing dispatches `resize`
    // for that, which is why the hook also observes the document.
    const el = document.createElement("div");
    document.body.appendChild(el);
    let top = 300;
    vi.spyOn(el, "getBoundingClientRect").mockImplementation(
      () => ({ top }) as DOMRect,
    );
    const ref = { current: el } as React.RefObject<HTMLElement | null>;
    const { result } = renderHook(() =>
      useViewportFillHeight(ref, { reserve: 100, min: 240 }),
    );
    expect(result.current).toBe(500);

    act(() => {
      top = 360;
      observers.forEach((o) => o.cb());
    });
    expect(result.current).toBe(440);
  });

  it("stays put when the observer fires with nothing changed", () => {
    // Guards the feedback loop: applying our own height must not move `top`
    // and start another round.
    const { result } = renderAt(300, { reserve: 100, min: 240 });
    const first = result.current;
    act(() => observers.forEach((o) => o.cb()));
    expect(result.current).toBe(first);
  });

  it("returns undefined when disabled, so the pane renders unbounded", () => {
    const { result } = renderAt(300, { enabled: false });
    expect(result.current).toBeUndefined();
  });

  it("stops measuring after unmount", () => {
    const { unmount } = renderAt(300, { reserve: 100, min: 240 });
    unmount();
    expect(observers[0].disconnect).toHaveBeenCalled();
    // A stray resize after teardown must not try to set state.
    expect(() =>
      act(() => {
        window.dispatchEvent(new Event("resize"));
      }),
    ).not.toThrow();
  });
});
