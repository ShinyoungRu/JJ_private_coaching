import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Port 5173 matches APP_URL in supabase/functions/.env and the local auth redirect URLs.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { port: 5173, strictPort: true },
  build: {
    rollupOptions: {
      output: {
        // Long-lived vendor chunks: cached by browsers across app deploys.
        manualChunks: {
          react: ["react", "react-dom", "react-router"],
          supabase: ["@supabase/supabase-js"],
        },
      },
    },
  },
});
