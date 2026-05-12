var _a;
import path from "path";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
// Vite config — proxies /api → backend so the frontend can call relative URLs
// without CORS gymnastics in dev.
export default defineConfig({
    plugins: [react()],
    resolve: {
        alias: {
            "@": path.resolve(__dirname, "./src"),
        },
    },
    server: {
        port: 5173,
        host: true,
        proxy: {
            "/api": {
                target: (_a = process.env.VITE_API_URL) !== null && _a !== void 0 ? _a : "http://127.0.0.1:8000",
                changeOrigin: true,
                rewrite: function (path) { return path.replace(/^\/api/, ""); },
            },
        },
    },
    test: {
        environment: "jsdom",
        globals: true,
    },
});
