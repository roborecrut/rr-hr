import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import tailwindcss from "@tailwindcss/vite";

const APP_VERSION = String(Date.now());

function versionJsonPlugin() {
  return {
    name: "rr-version-json",
    // Dev: serve /version.json from memory.
    configureServer(server: any) {
      server.middlewares.use("/version.json", (_req: any, res: any) => {
        res.setHeader("Content-Type", "application/json");
        res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
        res.end(JSON.stringify({ version: APP_VERSION }));
      });
    },
    // Build: emit /version.json into dist.
    generateBundle(this: any) {
      this.emitFile({
        type: "asset",
        fileName: "version.json",
        source: JSON.stringify({ version: APP_VERSION }),
      });
    },
  };
}

export default defineConfig(({ mode }) => ({
  define: {
    __APP_VERSION__: JSON.stringify(APP_VERSION),
  },
  plugins: [react(), tailwindcss(), versionJsonPlugin()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    host: "0.0.0.0",
    port: 8080,
  },
}));
