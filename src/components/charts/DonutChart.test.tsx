// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { DonutChart } from "./DonutChart";

afterEach(cleanup);

describe("DonutChart", () => {
  it("draws an empty ring when there is nothing to chart", () => {
    const { container, getByText } = render(
      <DonutChart slices={[{ label: "A", value: 0, color: "red" }]} total={0} />,
    );
    expect(getByText("No data yet")).toBeTruthy();
    expect(container.querySelectorAll("path")).toHaveLength(0);
  });

  it("draws one arc per non-zero slice, with the total in the hole", () => {
    const { container, getByText } = render(
      <DonutChart
        slices={[
          { label: "Disciplines", value: 750, color: "#a63434" },
          { label: "Indirects", value: 250, color: "#1e40af" },
          { label: "Nothing", value: 0, color: "#000" },
        ]}
        total={1000}
      />,
    );
    const arcs = [...container.querySelectorAll("path")];
    expect(arcs.map((a) => a.getAttribute("fill"))).toEqual([
      "#a63434",
      "#1e40af",
    ]);
    expect(getByText("Grand Total")).toBeTruthy();
    expect(getByText("$1.0K")).toBeTruthy();
  });

  it("draws a single full slice as a ring rather than an arc", () => {
    const { container } = render(
      <DonutChart slices={[{ label: "All", value: 5, color: "teal" }]} total={5} />,
    );
    expect(container.querySelectorAll("path")).toHaveLength(0);
    expect(container.querySelector('circle[fill="teal"]')).toBeTruthy();
  });
});
