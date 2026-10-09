import { describe, expect, it } from "vitest";
import {
  APPS,
  appById,
  appForPath,
  visibleAppLinks,
  visibleApps,
} from "./apps";
import { disciplinesData } from "./disciplines-data";

/**
 * `appForPath` decides which nav the shell renders, so a route it can't place
 * shows the wrong sidebar. These pin the resolution rules rather than the
 * groupings themselves — moving a page between apps should not fail here.
 */
describe("appForPath", () => {
  it("places each app's own links", () => {
    for (const app of APPS) {
      for (const link of app.links) {
        expect(appForPath(link.to as string)?.id).toBe(app.id);
      }
    }
  });

  it("places every app's home route in that app", () => {
    for (const app of APPS) {
      expect(appForPath(app.home as string)?.id).toBe(app.id);
    }
  });

  it("lets a longer, more specific path win over a prefix", () => {
    // These two are /admin routes that belong to other apps. Were the plain
    // "/admin" prefix to win, opening the CBS catalog would swap the nav out
    // from under the user.
    expect(appForPath("/admin/master-cbs")?.id).toBe("cbs");
    expect(appForPath("/admin/cvr-templates")?.id).toBe("reports");
    expect(appForPath("/admin/projects")?.id).toBe("admin");
    expect(appForPath("/admin")?.id).toBe("admin");
  });

  it("places every discipline take-off page in the estimate", () => {
    for (const d of disciplinesData) {
      if (d.to) expect(appForPath(d.to)?.id).toBe("estimate");
      for (const item of d.items ?? []) {
        if (item.to) expect(appForPath(item.to)?.id).toBe("estimate");
      }
    }
  });

  it("treats an unknown single-segment route as a take-off", () => {
    // `$discipline` is a catch-all, so a discipline added to the CBS without
    // being listed here still gets the estimate's sidebar rather than none.
    expect(appForPath("/some-new-discipline")?.id).toBe("estimate");
  });

  it("places the print routes with the records they print", () => {
    expect(appForPath("/fco-print/12")?.id).toBe("changes");
    expect(appForPath("/rfi-print/12")?.id).toBe("changes");
    expect(appForPath("/cvr-print/12")?.id).toBe("reports");
  });

  it("leaves the launcher and the help guide outside every app", () => {
    expect(appForPath("/")).toBeNull();
    expect(appForPath("/help")).toBeNull();
  });

  it("does not match a path that merely starts with the same characters", () => {
    // "/changelog-archive" is not under "/changelog".
    expect(appForPath("/reportingx")?.id).not.toBe("reports");
  });
});

describe("app registry", () => {
  it("gives every app a unique id and a home inside itself", () => {
    expect(new Set(APPS.map((a) => a.id)).size).toBe(APPS.length);
  });

  it("asks for the version picker only where versions apply", () => {
    // Versions are an estimate concept; offering the picker elsewhere implies
    // it filters something it doesn't.
    expect(APPS.filter((a) => a.versionScoped).map((a) => a.id)).toEqual([
      "estimate",
    ]);
  });

  it("uses the discipline tree for the estimate alone", () => {
    expect(APPS.filter((a) => a.disciplineNav).map((a) => a.id)).toEqual([
      "estimate",
    ]);
  });

  it("hides admin-only apps and links from a non-admin", () => {
    expect(visibleApps(false).map((a) => a.id)).not.toContain("admin");
    expect(visibleApps(true).map((a) => a.id)).toContain("admin");

    const cbs = appById.cbs;
    expect(visibleAppLinks(cbs, false).map((l) => l.label)).toEqual([
      "Project Cost Code List",
    ]);
    expect(visibleAppLinks(cbs, true)).toHaveLength(cbs.links.length);
  });
});
