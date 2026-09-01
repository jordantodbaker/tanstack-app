import * as React from "react";

/**
 * Sizes a scroll pane to fill the space between where it starts and the bottom
 * of the viewport.
 *
 * The FEF grid needs this because it is wide enough to always scroll
 * horizontally, and an unbounded-height container puts that horizontal
 * scrollbar at the bottom of the whole table — so reaching it means scrolling
 * the page down past every row first. Capping the pane keeps the scrollbar on
 * screen, and (as a side effect) gives the already-`sticky` header row a
 * container with room to scroll, which is what makes it actually stick.
 *
 * The height is deliberately measured at mount and on layout changes, NOT on
 * scroll: a pane that resized while you scrolled would be worse than a little
 * dead space at the bottom once the page chrome above it scrolls away.
 */

/** Pure height math, split out so the clamping rules are testable. */
/**
 * Share of the viewport a pane gets when it cannot fill the space below it.
 *
 * Generous on purpose: this is the STACKED case, where the page scrolls to
 * reach the pane anyway, so a taller pane costs nothing and a short one is
 * pure friction.
 */
const STACKED_VIEWPORT_RATIO = 0.7;

export function computeFillHeight(input: {
  /** The pane's top edge in viewport coordinates. */
  top: number;
  viewportHeight: number;
  /** Space to leave below the pane — pager, status line, page padding. */
  reserve: number;
  /** Never shrink below this; a tiny pane is worse than one that overflows. */
  min: number;
}): number {
  const available = input.viewportHeight - input.top - input.reserve;
  if (available >= input.min) return Math.round(available);

  // Not enough room below the pane to be worth filling — which happens when
  // the pane is not the page's only grid. Field Estimate stacks two: the
  // second starts at or past the bottom of the viewport, so "fill what is
  // left" evaluates to nothing and the pane collapsed to `min` — a 240px
  // window onto a sheet twelve hundred pixels tall.
  //
  // A stacked pane is reached by scrolling the page, so size it against the
  // viewport rather than against the (absent) space beneath it. Capped at the
  // viewport itself so the pane never exceeds one screen.
  return Math.max(
    input.min,
    Math.min(
      input.viewportHeight - input.reserve,
      Math.round(input.viewportHeight * STACKED_VIEWPORT_RATIO),
    ),
  );
}

/**
 * `useLayoutEffect` can't run during SSR, and React warns when a server-
 * rendered component uses it. This app server-renders, so fall back to
 * `useEffect` there. On the client we keep `useLayoutEffect` so the pane is
 * measured before paint — with plain `useEffect` the grid renders unbounded
 * for a frame and visibly snaps to its capped height.
 */
const useIsomorphicLayoutEffect =
  typeof window !== "undefined" ? React.useLayoutEffect : React.useEffect;

export type FillHeightOptions = {
  /** Space to leave below the pane. Default covers the pager + status line. */
  reserve?: number;
  /** Floor for the computed height. */
  min?: number;
  /** Set false to leave the pane unbounded (e.g. print views). */
  enabled?: boolean;
};

/**
 * Returns the max-height to apply to `ref`'s element, or `undefined` while it
 * is unmeasured (SSR and the first paint) so the pane renders unbounded rather
 * than briefly collapsed.
 */
export function useViewportFillHeight(
  ref: React.RefObject<HTMLElement | null>,
  { reserve = 96, min = 240, enabled = true }: FillHeightOptions = {},
): number | undefined {
  const [height, setHeight] = React.useState<number | undefined>(undefined);

  useIsomorphicLayoutEffect(() => {
    if (!enabled || typeof window === "undefined") {
      setHeight(undefined);
      return;
    }
    const el = ref.current;
    if (!el) return;

    const measure = () => {
      const { top } = el.getBoundingClientRect();
      setHeight(
        computeFillHeight({
          top,
          viewportHeight: window.innerHeight,
          reserve,
          min,
        }),
      );
    };

    measure();
    window.addEventListener("resize", measure);

    // The pane's top edge also moves when chrome ABOVE it changes height — the
    // find bar opening, a grouped-header banner appearing, tabs wrapping on a
    // narrow window. Observing the document catches those without each caller
    // having to notify us.
    //
    // This can't oscillate: `top` is determined by what sits above the pane, so
    // applying the height we computed never changes the next measurement, and
    // React bails out when the value is unchanged.
    const observer = new ResizeObserver(measure);
    observer.observe(document.body);

    return () => {
      window.removeEventListener("resize", measure);
      observer.disconnect();
    };
  }, [ref, reserve, min, enabled]);

  return height;
}
