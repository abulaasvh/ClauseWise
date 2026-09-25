import "@testing-library/jest-dom";
import "@anthropic-ai/sdk/shims/node";

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
