import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwind from "@tailwindcss/vite";
import { glassUx } from "glass-ux/vite";

export default defineConfig({
  base: "./",
  plugins: [react(), tailwind(), glassUx()],
  resolve: { dedupe: ["react", "react-dom"] },
  server: { fs: { allow: ["..", "../../glass-ux"] } },
});
