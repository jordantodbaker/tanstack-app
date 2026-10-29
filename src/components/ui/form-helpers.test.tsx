// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { DateInput, NumberInput } from "./form-helpers";

afterEach(cleanup);

describe("DateInput", () => {
  it("shows the local calendar day of an ISO timestamp", () => {
    const iso = new Date(2026, 9, 28, 15, 30).toISOString();
    render(<DateInput aria-label="Due" value={iso} onChange={() => {}} />);
    expect(screen.getByLabelText<HTMLInputElement>("Due").value).toBe(
      "2026-10-28",
    );
  });

  it("is blank for a null date", () => {
    render(<DateInput aria-label="Due" value={null} onChange={() => {}} />);
    expect(screen.getByLabelText<HTMLInputElement>("Due").value).toBe("");
  });

  it("hands back local midnight as ISO", () => {
    const onChange = vi.fn();
    render(<DateInput aria-label="Due" value={null} onChange={onChange} />);
    const box = screen.getByLabelText("Due");

    fireEvent.change(box, { target: { value: "2026-11-02" } });
    expect(onChange).toHaveBeenLastCalledWith(
      new Date(2026, 10, 2).toISOString(),
    );

  });

  it("hands back null when a date is cleared", () => {
    const onChange = vi.fn();
    render(
      <DateInput
        aria-label="Due"
        value={new Date(2026, 10, 2).toISOString()}
        onChange={onChange}
      />,
    );
    fireEvent.change(screen.getByLabelText("Due"), { target: { value: "" } });
    expect(onChange).toHaveBeenLastCalledWith(null);
  });
});

describe("NumberInput", () => {
  it("hands back the number typed, fractions and all", () => {
    const onChange = vi.fn();
    render(<NumberInput aria-label="Cost" value={0} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText("Cost"), {
      target: { value: "1250.75" },
    });
    expect(onChange).toHaveBeenLastCalledWith(1250.75);
  });

  it("treats an emptied box as 0", () => {
    const onChange = vi.fn();
    render(<NumberInput aria-label="Cost" value={5} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText("Cost"), { target: { value: "" } });
    expect(onChange).toHaveBeenLastCalledWith(0);
  });

  it("drops the fraction when integer", () => {
    const onChange = vi.fn();
    render(
      <NumberInput aria-label="Days" integer value={0} onChange={onChange} />,
    );
    fireEvent.change(screen.getByLabelText("Days"), {
      target: { value: "3.9" },
    });
    expect(onChange).toHaveBeenLastCalledWith(3);
  });

  it("passes other input props through", () => {
    render(
      <NumberInput aria-label="Cost" step={100} value={0} onChange={() => {}} />,
    );
    const box = screen.getByLabelText<HTMLInputElement>("Cost");
    expect(box.type).toBe("number");
    expect(box.step).toBe("100");
  });
});
