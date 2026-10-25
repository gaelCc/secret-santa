import { defineConfig } from "vite";

export default defineConfig({
  // Relative asset paths, so the site works at https://<user>.github.io/<repo>/
  // without hard-coding the repository name.
  base: "./",
});
