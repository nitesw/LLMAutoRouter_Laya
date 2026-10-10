import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Stats come from the running router proxy.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { port: 8788, strictPort: true, proxy: { "/_router": process.env.PROXY_URL ?? "http://localhost:8787" } },
});
