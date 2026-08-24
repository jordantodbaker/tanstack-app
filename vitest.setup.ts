// Global test setup. Loads jest-dom's custom matchers (toBeInTheDocument,
// toHaveTextContent, …) onto `expect` — but ONLY in the jsdom files that can
// actually use them.
//
// Importing jest-dom costs a few hundred ms per test file, and it was
// previously paid by all 66 files even though only the ~10 component tests
// need it. Gating on `document` keeps that cost off the pure-logic files, which
// run in the default `node` environment where the matchers could never be
// called anyway.
//
// This deliberately keys off the environment rather than a hardcoded file list
// in vitest.config.ts, so the existing convention still holds: a test opts into
// a DOM with a `// @vitest-environment jsdom` docblock and gets the matchers
// automatically — nothing to register anywhere else.
if (typeof document !== "undefined") {
  await import("@testing-library/jest-dom/vitest");
}

// Marks the file as a module so the top-level `await` above typechecks under
// `tsc --noEmit` (which `npm run build` runs). Vitest already treats setup
// files as ESM; this is purely for the compiler.
export {};
