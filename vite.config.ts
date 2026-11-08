// Native TanStack-Start-Konfiguration (ohne Framework-Wrapper).
// Alle Plugins sind hier explizit aufgelistet: tsconfig-Paths, Tailwind,
// React und Nitro. Der tanstackStart-Plugin (inkl. Router-Codegenerierung)
// wird über defineConfig von @tanstack/react-start/config ergänzt.
import { defineConfig } from "@tanstack/react-start/config";
import tailwindcss from "@tailwindcss/vite";
import viteReact from "@vitejs/plugin-react";
import viteTsConfigPaths from "vite-tsconfig-paths";
import nitro from "nitro/vite";

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  vite: {
    plugins: [
      viteTsConfigPaths({ projects: ["./tsconfig.json"] }),
      tailwindcss(),
      viteReact(),
      nitro(),
    ],
  },
});
