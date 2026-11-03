import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwind from "@tailwindcss/vite";
import { glassUx } from "glass-ux/vite";

export default defineConfig({
  base: process.env.GLASS_UX_IMAGE_BASE ?? "./",
  plugins: [
    ...(process.env.GI_OWN_PORT ? [{
      name: "image-source",
      enforce: "pre" as const,
      resolveId(id: string) {
        if(id==="glass-ux-image/styles.css")return "\0gi-own.css";
        if(!id.startsWith("glass-ux-image/"))return;
        const entry=id.slice("glass-ux-image/".length);
        const dirs=["core","render","io","session","react","canvas","photo-editor","editor","retouch"];
        const base=resolve(import.meta.dirname,"../../src",entry);
        return [base+".ts",base+".tsx",base+"/index.ts",base+"/index.tsx"].find(p=>existsSync(p)) ?? (dirs.includes(entry) ? base+"/index.ts" : base+".ts");
      },
      load(id: string) {
        if(id!=="\0gi-own.css")return;
        return ["styles.css",...["geometry","develop","retouch","effects","files","layers","workspace"].map(d=>"styles/"+d+".css")].map(p=>readFileSync(resolve(import.meta.dirname,"../../src",p),"utf8")).join("\n");
      }
    }] : []),
    react(), tailwind(), glassUx()
  ],
  // Vite refuses unknown hostnames, so opening the demo over Tailscale needs this.
  server: { allowedHosts: [".ts.net", "development"] },
  build: {
    rollupOptions: {
      input: { foundation: resolve(import.meta.dirname, "foundation.html"), main: resolve(import.meta.dirname, "index.html"), conformance: resolve(import.meta.dirname, "conformance.html") },
    },
  },
});
