import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          950: "#080d18",
          900: "#0e1726",
          800: "#111b2b",
          700: "#26374d",
          600: "#34445b",
          500: "#637891",
        },
        acid: {
          DEFAULT: "#bdf5ff",
          soft: "#e2fbff",
          dim: "#7dcbdc",
        },
        ember: "#ff9c9c",
        sol: "#dcc6ff",
        slate: { 100: "#f3faff", 200: "#dce9f4", 300: "#bcccdc", 400: "#a9bbd0", 500: "#879bb3" },
      },
      fontFamily: {
        sans: ["var(--font-body)", "system-ui", "-apple-system", "Segoe UI", "sans-serif"],
        display: ["var(--font-display)", "Impact", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "SFMono-Regular", "monospace"],
      },
      boxShadow: {
        glow: "0 0 0 1px rgba(189,245,255,0.18), 0 20px 60px -20px rgba(125,203,220,0.18)",
      },
    },
  },
  plugins: [],
};

export default config;
