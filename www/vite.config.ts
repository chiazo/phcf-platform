import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Keep the PUBLIC_ env prefix so existing .env / deploy scripts don't
// need to change (Vite otherwise only exposes VITE_-prefixed vars).
export default defineConfig({
  plugins: [react()],
  envPrefix: ["VITE_", "PUBLIC_"],
  server: {
    port: 4321,
  },
});
