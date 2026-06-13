import {
  odysseusDark,
  tailwindBlue,
  tailwindCyan,
  tailwindGray,
  tailwindGreen,
  tailwindOrange,
  tailwindRed,
  tailwindSlate,
  tailwindYellow,
} from "./src/theme/odysseus.ts";

/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Fira Code"', "ui-monospace", "SFMono-Regular", "Menlo", "Monaco", "Consolas", "monospace"],
        mono: ['"Fira Code"', "ui-monospace", "SFMono-Regular", "Menlo", "Monaco", "Consolas", "monospace"],
      },
      borderRadius: {
        DEFAULT: "4px",
        md: "6px",
        lg: "10px",
      },
      boxShadow: {
        panel: "0 4px 16px rgba(0, 0, 0, 0.35)",
        modal: "0 8px 32px rgba(0, 0, 0, 0.45)",
      },
      colors: {
        slate: tailwindSlate,
        gray: tailwindGray,
        cyan: tailwindCyan,
        orange: tailwindOrange,
        blue: tailwindBlue,
        green: tailwindGreen,
        red: tailwindRed,
        yellow: tailwindYellow,
        prism: odysseusDark,
      },
    },
  },
  plugins: [],
};
