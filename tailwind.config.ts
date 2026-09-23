import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        headline: ["Fraunces", "Georgia", "serif"],
        body: ["'IBM Plex Sans'", "-apple-system", "sans-serif"],
        serif: ["Newsreader", "Merriweather", "Georgia", "serif"],
        sans: [
          "'IBM Plex Sans'",
          "Inter",
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "sans-serif",
        ],
        mono: [
          "JetBrains Mono",
          "ui-monospace",
          "SFMono-Regular",
          "Menlo",
          "monospace",
        ],
      },
      colors: {
        ink: {
          navy: "#12203D",
          DEFAULT: "#12203D",
        },
        paper: {
          DEFAULT: "#F6F7F9",
        },
        jade: {
          DEFAULT: "#2E6E5E",
          50: "#F0F7F5",
          100: "#E0EFEB",
          200: "#C1DFD7",
          600: "#2E6E5E",
          700: "#24574A",
          800: "#1B3F36",
        },
        legal: {
          50: "#f8fafc",
          100: "#f1f5f9",
          200: "#e2e8f0",
          300: "#cbd5e1",
          400: "#94a3b8",
          500: "#64748b",
          600: "#475569",
          700: "#334155",
          800: "#1e293b",
          900: "#0f172a",
          950: "#020617",
        },
        risk: {
          low: {
            bg: "#f0fdf4",
            border: "#bbf7d0",
            text: "#166534",
            badge: "#dcfce7",
          },
          medium: {
            bg: "#fffbeb",
            border: "#fde68a",
            text: "#92400e",
            badge: "#fef3c7",
          },
          high: {
            bg: "#fef2f2",
            border: "#fecaca",
            text: "#991b1b",
            badge: "#fee2e2",
          },
        },
      },
    },
  },
  plugins: [],
};
export default config;
