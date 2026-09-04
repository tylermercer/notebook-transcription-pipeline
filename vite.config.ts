import { defineConfig } from "vite";

export default defineConfig({
  build: {
    lib: {
      entry: {
        worker: "src/index.ts",
      },
      formats: ["es"],
      fileName: () => "worker.js",
    },
    outDir: "dist",
    target: "esnext",
    minify: false,
    ssr: true,
  },
  ssr: {
    target: "webworker",
  },
});
