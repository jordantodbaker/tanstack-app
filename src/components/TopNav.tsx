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
 * painted on top of the user/sign-out cluster to their right. The set needs
 * ~580px and only got 111px at 1280 and 431px at 1600, so on every laptop
 * "PCOs" sat on top of "Sign out" — links that were unreadable and unclickable
 * rather than merely cramped.
 *
 * Measuring is done once against natural widths: `shrink-0` on each link keeps
 * `offsetWidth` honest (a shrunk flex item reports its squeezed box while its
 * text spills), and the labels are static, so widths only need re-reading when
 * the link set itself changes.
 */

const LINK_CLASS =
  "shrink-0 px-3 md:px-4 py-2 rounded-md text-sm font-medium transition-colors";
const ACTIVE = { className: "text-red-800 bg-red-50" };
const INACTIVE = {
  className: "text-slate-600 hover:text-slate-900 hover:bg-slate-100",
};
/** Width the "More" trigger needs; reserved before deciding what fits. */
const MORE_WIDTH = 84;

export function TopNav({ isAdmin }: { isAdmin: boolean }) {
  const links = React.useMemo(
    () => TOP_NAV_LINKS.filter((l) => !l.adminOnly || isAdmin),
    [isAdmin],
  );

  const navRef = React.useRef<HTMLElement | null>(null);
  const widthsRef = React.useRef<number[]>([]);
  const [visibleCount, setVisibleCount] = React.useState(links.length);

  React.useLayoutEffect(() => {
    const el = navRef.current;
    if (!el || typeof window === "undefined") return;

    const measure = () => {
      // Read natural widths from the rendered links the first time (and again
      // whenever the link set changes), then keep them — re-reading while some
      // links are hidden would measure a subset and oscillate.
      if (widthsRef.current.length !== links.length) {
        const items = [...el.querySelectorAll<HTMLElement>("[data-nav-link]")];
        if (items.length === links.length) {
          widthsRef.current = items.map((n) => n.offsetWidth);
        }
      }
      const widths = widthsRef.current;
      if (widths.length !== links.length) return;

      const available = el.clientWidth;
      const total = widths.reduce((a, b) => a + b, 0);
      if (total <= available) {
        setVisibleCount(links.length);
        return;
      }
      // Something must collapse, so the "More" trigger now costs space too.
      let used = MORE_WIDTH;
      let fit = 0;
      for (const w of widths) {
        if (used + w > available) break;
        used += w;
        fit++;
      }
      setVisibleCount(fit);
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [links]);

  const shown = visibleCount >= links.length ? links : links.slice(0, visibleCount);
  const hidden = visibleCount >= links.length ? [] : links.slice(visibleCount);

  const renderLink = (l: TopNavLink) => (
    <Link
      key={l.to}
      to={l.to}
      data-nav-link
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
      className="hidden lg:flex items-center gap-1 flex-1 min-w-0 overflow-hidden"
    >
      {shown.map(renderLink)}
      {hidden.length > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="shrink-0 inline-flex items-center gap-1 rounded-md px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900"
            >
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
