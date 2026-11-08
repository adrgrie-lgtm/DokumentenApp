// Native TanStack-Start-Konfiguration (ohne Framework-Wrapper).
// Alle Plugins sind hier explizit aufgelistet; der tanstackStart-Plugin
// übernimmt Router-Codegenerierung, SSR-Entry und Server-Functions.
import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import tailwindcss from "@tailwindcss/vite";
import viteReact from "@vitejs/plugin-react";
import viteTsConfigPaths from "vite-tsconfig-paths";
import nitro from "nitro/vite";

export default defineConfig({
  plugins: [
    tanstackStart({
      // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
      // nitro/vite builds from this
      server: { entry: "server" },
    }),
    viteTsConfigPaths({ projects: ["./tsconfig.json"] }),
    tailwindcss(),
    viteReact(),
    nitro(),
  ],
});
