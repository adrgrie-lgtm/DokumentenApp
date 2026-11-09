// Native TanStack-Start-Konfiguration (ohne Framework-Wrapper).
// Alle Plugins sind hier explizit aufgelistet; der tanstackStart-Plugin
// uebernimmt Router-Codegenerierung, SSR-Entry und Server-Functions.
import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import tailwindcss from "@tailwindcss/vite";
import viteReact from "@vitejs/plugin-react";
import viteTsConfigPaths from "vite-tsconfig-paths";
// nitro 3.0.260603-beta exportiert die Vite-Plugin-Funktion nur als
// Named Export (kein Default) – Default-Import laesst vite dev crashen.
import { nitro } from "nitro/vite";

export default defineConfig({
  plugins: [
    tanstackStart({
      // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
      server: { entry: "server" },
    }),
    viteTsConfigPaths({ projects: ["./tsconfig.json"] }),
    tailwindcss(),
    viteReact(),
    nitro(),
  ],
});
