import * as React from "react";
import { Link } from "@tanstack/react-router";
import { ChevronDown } from "lucide-react";
import { TOP_NAV_LINKS, type TopNavLink } from "~/config/top-nav-links";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";

/**
 * Header navigation that collapses what doesn't fit into a "More" menu.
 *
 * It used to be a plain flex row with `flex-1 min-w-0`, which let the NAV box
 * shrink but not the links inside it: they kept their natural width and simply
 * painted on top of the user/sign-out cluster to their right.
 *
 * Widths are read from an always-rendered, invisible copy of the full link
 * row (plus the "More" trigger), never from the visible links. That way the
 * measurement is independent of what is currently collapsed, picks up the web
 * font once it loads (fallback-font widths are narrower, which used to leave
 * the row overflowing with "More" clipped off the end), and follows the link
 * set when it changes. The flex gap is part of the arithmetic.
 */

const LINK_CLASS =
  "shrink-0 px-3 md:px-4 py-2 rounded-md text-sm font-medium transition-colors";
const ACTIVE = { className: "text-red-800 bg-red-50" };
const INACTIVE = {
  className: "text-slate-600 hover:text-slate-900 hover:bg-slate-100",
};
const MORE_CLASS =
  "shrink-0 inline-flex items-center gap-1 rounded-md px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900";
/** Matches `gap-1` on the nav row. */
const GAP = 4;

/**
 * How many leading links fit in `available` px. When everything fits, all of
 * them; otherwise the "More" trigger is reserved first and links are added
 * until the next one (plus its gap) would overflow.
 */
export function computeVisibleCount(
  widths: readonly number[],
  moreWidth: number,
  available: number,
  gap: number = GAP,
): number {
  const rowWidth = (n: number) =>
    widths.slice(0, n).reduce((a, b) => a + b, 0) + Math.max(0, n - 1) * gap;
  if (rowWidth(widths.length) <= available) return widths.length;
  let fit = 0;
  while (
    fit < widths.length &&
    rowWidth(fit + 1) + gap + moreWidth <= available
  ) {
    fit++;
  }
  return fit;
}

export function TopNav({ isAdmin }: { isAdmin: boolean }) {
  const links = React.useMemo(
    () => TOP_NAV_LINKS.filter((l) => !l.adminOnly || isAdmin),
    [isAdmin],
  );

  const navRef = React.useRef<HTMLElement | null>(null);
  const probeRef = React.useRef<HTMLDivElement | null>(null);
  const [visibleCount, setVisibleCount] = React.useState(links.length);

  React.useLayoutEffect(() => {
    const nav = navRef.current;
    const probe = probeRef.current;
    if (!nav || !probe || typeof window === "undefined") return;

    const measure = () => {
      const items = [...probe.querySelectorAll<HTMLElement>("[data-nav-probe]")];
      const more = probe.querySelector<HTMLElement>("[data-nav-more-probe]");
      if (items.length !== links.length || !more) return;
      setVisibleCount(
        computeVisibleCount(
          items.map((n) => n.offsetWidth),
          more.offsetWidth,
          nav.clientWidth,
        ),
      );
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(nav);
    // Label widths change when the web font swaps in; the nav box itself
    // doesn't, so the ResizeObserver alone would miss it.
    let cancelled = false;
    document.fonts?.ready.then(() => {
      if (!cancelled) measure();
    });
    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, [links]);

  const shown = links.slice(0, visibleCount);
  const hidden = links.slice(visibleCount);

  const renderLink = (l: TopNavLink) => (
    <Link
      key={l.to}
      to={l.to}
      className={LINK_CLASS}
      activeProps={ACTIVE}
      inactiveProps={INACTIVE}
      activeOptions={{ exact: true }}
    >
      {l.label}
    </Link>
  );

  return (
    <nav
      ref={navRef}
      className="relative hidden lg:flex items-center gap-1 flex-1 min-w-0 overflow-hidden"
    >
      {/* Invisible full-width copy used only for measuring natural widths. */}
      <div
        ref={probeRef}
        aria-hidden
        className="pointer-events-none invisible absolute top-0 left-0 flex items-center gap-1 whitespace-nowrap"
      >
        {links.map((l) => (
          <span key={l.to} data-nav-probe className={LINK_CLASS}>
            {l.label}
          </span>
        ))}
        <span data-nav-more-probe className={MORE_CLASS}>
          More
          <ChevronDown className="size-3.5" />
        </span>
      </div>

      {shown.map(renderLink)}
      {hidden.length > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" aria-label="More navigation" className={MORE_CLASS}>
              More
              <ChevronDown className="size-3.5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {hidden.map((l) => (
              <DropdownMenuItem key={l.to} asChild>
                <Link to={l.to} activeProps={ACTIVE} activeOptions={{ exact: true }}>
                  {l.label}
                </Link>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </nav>
  );
}
