import "@testing-library/jest-dom";
import "@anthropic-ai/sdk/shims/node";

jest.mock("lucide-react", () => {
  const React = require("react");
  const Icon = ({ children, ...props }) => React.createElement("svg", props, children);
  return new Proxy({}, { get: () => Icon });
});

if (typeof global.fetch === "undefined") {
  global.fetch = jest.fn();
}
if (typeof HTMLElement !== "undefined" && !HTMLElement.prototype.scrollIntoView) {
  HTMLElement.prototype.scrollIntoView = jest.fn();
}

// Polyfill TextEncoder/TextDecoder if not in environment
if (typeof global.TextEncoder === "undefined") {
  const { TextEncoder, TextDecoder } = require("util");
  global.TextEncoder = TextEncoder;
  global.TextDecoder = TextDecoder;
}

// Polyfill fetch and Web APIs for jsdom/node test environment
if (typeof global.fetch === "undefined" && typeof globalThis.fetch !== "undefined") {
  global.fetch = globalThis.fetch;
}
if (typeof window !== "undefined" && !window.fetch && globalThis.fetch) {
  window.fetch = globalThis.fetch;
}
