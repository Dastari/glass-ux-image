import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwind from "@tailwindcss/vite";
import { glassUx } from "glass-ux/vite";

export default defineConfig({
  // A project site on GitHub Pages sets this to its repository path, such as /my-package/.
  base: process.env.DOCS_BASE ?? "/glass-ux-image/",
  plugins: [react(), tailwind(), glassUx()],
  // ES workers keep a worker's dynamic imports (one decoder per format) as their own lazy chunks.
  worker: { format: "es" },
  // The kit imports glass-ux entries: bundled apart they would be a second copy of its contexts.
  optimizeDeps: { exclude: ["glass-ux-docs-kit"], include: ["glass-ux-docs-kit > clsx"] },
  // The site reads the project's sources from outside this folder.
  server: { fs: { allow: ["../.."] } },
});
