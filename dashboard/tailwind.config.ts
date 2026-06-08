import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: { sans: ["Inter", "system-ui", "sans-serif"] },
      colors: {
        brand: { 50: "#f0f6ff", 500: "#2563eb", 600: "#1d4ed8", 700: "#1e40af" },
      },
    },
  },
  plugins: [],
};

export default config;
