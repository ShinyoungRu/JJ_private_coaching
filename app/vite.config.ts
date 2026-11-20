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
        // "react-dom/client" is a separate entry from "react-dom"; without it the renderer
        // (~180 KB) lands in the app chunk and is re-downloaded on every deploy.
        manualChunks: {
          react: ["react", "react-dom", "react-dom/client", "react-router"],
          supabase: ["@supabase/supabase-js"],
        },
      },
    },
  },
});
