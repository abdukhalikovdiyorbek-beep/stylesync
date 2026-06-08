/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        terracotta: "hsl(var(--terracotta))",
        "terracotta-deep": "hsl(var(--terracotta-deep))",
        sage: "hsl(var(--sage))",
        "sage-soft": "hsl(var(--sage-soft))",
        ink: "hsl(var(--ink))",
        muted: "hsl(var(--muted))",
        line: "hsl(var(--line))",
        cream: "hsl(var(--bg))",
      },
      borderRadius: {
        token: "var(--radius)",
      },
      fontFamily: {
        display: ["'Playfair Display'", "Georgia", "serif"],
        body: ["Inter", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};
