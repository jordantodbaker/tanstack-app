import { describe, expect, it } from "vitest";
import {
  cbsReleaseConsented,
  parseCbsReleaseArgs,
  resolveCbsReleaseTargets,
} from "./cbs-release";

const ENV = {
  CBS_DB_LOCAL: "postgresql://u:secret@local.example/db",
  CBS_DB_STAGE: "postgresql://u:secret@stage.example/db",
};

describe("parseCbsReleaseArgs", () => {
  it("defaults to both targets, local first, consenting to neither", () => {
    expect(parseCbsReleaseArgs([])).toEqual({
      targets: ["local", "stage"],
      dryRun: false,
      legacy: false,
      skipExpand: false,
      yes: [],
    });
  });

  it("reads the flags", () => {
    expect(
      parseCbsReleaseArgs([
        "--target=stage",
        "--yes=local",
        "--dry-run",
        "--legacy",
        "--skip-expand",
      ]),
    ).toEqual({
      targets: ["stage"],
      dryRun: true,
      legacy: true,
      skipExpand: true,
      yes: ["local"],
    });
  });

  it.each(["--dryrun", "--yes", "--yes=all", "--target=prod", "stage"])(
    "refuses %s",
    (arg) => {
      expect(() => parseCbsReleaseArgs([arg])).toThrow();
    },
  );
});

describe("resolveCbsReleaseTargets", () => {
  it("names each host", () => {
    expect(
      resolveCbsReleaseTargets(["local", "stage"], ENV).map((t) => t.host),
    ).toEqual(["local.example", "stage.example"]);
  });

  it("refuses a missing URL", () => {
    expect(() => resolveCbsReleaseTargets(["stage"], {})).toThrow(
      "CBS_DB_STAGE is not set",
    );
  });

  it("refuses both names pointing at one database", () => {
    expect(() =>
      resolveCbsReleaseTargets(["local", "stage"], {
        ...ENV,
        CBS_DB_STAGE: ENV.CBS_DB_LOCAL,
      }),
    ).toThrow("same database");
  });

  it("never prints a malformed URL, which may hold a password", () => {
    expect(() =>
      resolveCbsReleaseTargets(["local"], { CBS_DB_LOCAL: "u:secret@host" }),
    ).not.toThrow("secret");
  });
});

describe("cbsReleaseConsented", () => {
  it("takes only the target's own name", () => {
    expect(cbsReleaseConsented("stage", " Stage ")).toBe(true);
    for (const no of ["", "y", "yes", "local"]) {
      expect(cbsReleaseConsented("stage", no)).toBe(false);
    }
  });
});
