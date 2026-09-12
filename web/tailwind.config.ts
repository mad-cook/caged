import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          950: "#07080c",
          900: "#0d0f16",
          800: "#141826",
          700: "#1e2436",
          600: "#2a3249",
          500: "#3d4763",
        },
        acid: {
          DEFAULT: "#c6ff4d",
          soft: "#e4ffa6",
          dim: "#8fbf2a",
        },
        ember: "#ff7a45",
        sol: "#9945ff",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "-apple-system", "Segoe UI", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "SFMono-Regular", "monospace"],
      },
      boxShadow: {
        glow: "0 0 0 1px rgba(198,255,77,0.25), 0 20px 60px -20px rgba(198,255,77,0.35)",
      },
    },
  },
  plugins: [],
};

export default config;
