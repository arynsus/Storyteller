/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./index.html",
    "./src/**/*.{vue,js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        accent: {
          DEFAULT: "#7c6cff",
          soft: "#9488ff",
          deep: "#6858e0",
        },
        surface: {
          0: "#0e0f13",
          1: "#15171e",
          2: "#1b1e27",
          3: "#222633",
          4: "#2b3040",
        },
      },
      borderRadius: {
        xl: "14px",
        "2xl": "18px",
      },
      boxShadow: {
        glow: "0 0 0 1px rgba(124,108,255,0.35), 0 8px 30px -8px rgba(124,108,255,0.45)",
        card: "0 1px 0 0 rgba(255,255,255,0.03) inset, 0 10px 30px -18px rgba(0,0,0,0.9)",
      },
      fontFamily: {
        sans: [
          "Inter",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Roboto",
          "Helvetica Neue",
          "Arial",
          "sans-serif",
        ],
      },
    },
  },
  plugins: [],
}
