import { describe, expect, it } from "vitest";
import {
  mapCvrResult,
  mapFcoResult,
  mapPcoResult,
  mapRfiResult,
  mapTrendResult,
} from "./search";

describe("search result mappers", () => {
  it("maps a CVR row, using the number for filterQuery", () => {
    const r = mapCvrResult({
      id: 7,
      cvrNumber: "CVR-012",
      title: "Rebar conflict",
      status: "APPROVED",
      discipline: "civil",
    });
    expect(r).toEqual({
      entity: "cvr",
      id: 7,
      number: "CVR-012",
      title: "Rebar conflict",
      status: "APPROVED",
      discipline: "civil",
      route: "/changelog",
      filterQuery: "CVR-012",
    });
  });

  it("falls back to the title for filterQuery when the number is empty", () => {
    const r = mapFcoResult({
      id: 3,
      fcoNumber: "",
      title: "Unmarked utility",
      status: "DRAFT",
      discipline: "piping",
    });
    expect(r.route).toBe("/fco-log");
    expect(r.filterQuery).toBe("Unmarked utility");
  });

  it("maps an RFI using subject as the title", () => {
    const r = mapRfiResult({
      id: 9,
      rfiNumber: "RFI-004",
      subject: "Valve spec clarification",
      status: "OPEN",
      discipline: "piping",
    });
    expect(r.entity).toBe("rfi");
    expect(r.title).toBe("Valve spec clarification");
    expect(r.route).toBe("/rfis");
    expect(r.filterQuery).toBe("RFI-004");
  });

  it("maps a PCO with an empty discipline", () => {
    const r = mapPcoResult({
      id: 2,
      pcoNumber: "PCO-001",
      title: "Owner directive bundle",
      status: "SUBMITTED",
    });
    expect(r.entity).toBe("pco");
    expect(r.discipline).toBe("");
    expect(r.route).toBe("/pco");
  });

  it("maps a Trend row", () => {
    const r = mapTrendResult({
      id: 5,
      trendNumber: "TR-002",
      title: "Productivity drift",
      status: "IDENTIFIED",
      discipline: "electrical",
    });
    expect(r.entity).toBe("trend");
    expect(r.route).toBe("/trends");
    expect(r.filterQuery).toBe("TR-002");
  });
});
