// Global test setup. Only loads jest-dom's custom matchers (toBeInTheDocument,
// toHaveTextContent, …) onto `expect`. Importing this is safe in the Node
// environment used by the pure-logic tests — the matchers only touch the DOM
// when actually called, which happens solely in the jsdom component tests
// (those files opt in with a `// @vitest-environment jsdom` docblock and call
// React Testing Library's `cleanup` themselves).
import "@testing-library/jest-dom/vitest";
