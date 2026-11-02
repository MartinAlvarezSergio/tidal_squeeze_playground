import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: "/tidal_squeeze_playground/",
  plugins: [react()]
});
