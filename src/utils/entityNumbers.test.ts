import { describe, expect, it } from "vitest";
import type { Prisma } from "../generated/prisma/client";
import {
  allocateEntityNumber,
  allocateIfBlank,
  formatEntityNumber,
} from "./entityNumbers.server";

/** Fake transaction client whose `$queryRaw` returns a fixed sequence row and
 *  records how many times it was called — lets us unit-test the allocation
 *  formatting + the keep-vs-allocate decision without a database. */
function fakeTx(row: { lastValue: number; prefix: string; padWidth: number }) {
  const calls: number[] = [];
  const tx = {
    $queryRaw: async () => {
      calls.push(1);
      return [row];
    },
  };
  return { tx: tx as unknown as Prisma.TransactionClient, calls };
}

describe("formatEntityNumber", () => {
  it("zero-pads to the configured width", () => {
    expect(formatEntityNumber("CVR-", 7, 3)).toBe("CVR-007");
    expect(formatEntityNumber("TR-", 1, 3)).toBe("TR-001");
    expect(formatEntityNumber("CVR-", 123, 3)).toBe("CVR-123");
  });

  it("doesn't truncate a value wider than the pad", () => {
    expect(formatEntityNumber("CVR-", 1234, 3)).toBe("CVR-1234");
  });
});

describe("allocateEntityNumber", () => {
  it("formats from the sequence row's own prefix/padWidth, not code defaults", () => {
    // Row carries a custom prefix/width (e.g. an admin-edited sequence); the
    // result must reflect the row, proving allocation reads the RETURNING row.
    const { tx } = fakeTx({ lastValue: 5, prefix: "ZZ-", padWidth: 4 });
    return expect(
      allocateEntityNumber(tx, 1, "ChangeLog"),
    ).resolves.toBe("ZZ-0005");
  });
});

describe("allocateIfBlank", () => {
  it("keeps a user-supplied number and never touches the sequence", async () => {
    const { tx, calls } = fakeTx({
      lastValue: 1,
      prefix: "CVR-",
      padWidth: 3,
    });
    await expect(
      allocateIfBlank(tx, 1, "ChangeLog", "CVR-099"),
    ).resolves.toBe("CVR-099");
    expect(calls).toHaveLength(0);
  });

  it("allocates when the provided value is empty or whitespace", async () => {
    const blank = fakeTx({ lastValue: 11, prefix: "CVR-", padWidth: 3 });
    await expect(
      allocateIfBlank(blank.tx, 1, "ChangeLog", ""),
    ).resolves.toBe("CVR-011");
    expect(blank.calls).toHaveLength(1);

    const whitespace = fakeTx({ lastValue: 12, prefix: "CVR-", padWidth: 3 });
    await expect(
      allocateIfBlank(whitespace.tx, 1, "ChangeLog", "   "),
    ).resolves.toBe("CVR-012");
    expect(whitespace.calls).toHaveLength(1);
  });
});
