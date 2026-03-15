import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    svelte(),
    VitePWA({
      registerType: "autoUpdate",
      manifest: {
        name: "9Darters Losice",
        short_name: "9Darters",
        theme_color: "#0f172a",
        background_color: "#08111f",
        display: "standalone",
        scope: "/",
        start_url: "/",
        icons: [
          {
            src: "/icon.svg",
            sizes: "512x512",
            type: "image/svg+xml",
            purpose: "any maskable"
          }
        ]
      }
    })
  ],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:4000",
        changeOrigin: true
      },
      "/socket.io": {
        target: "ws://localhost:4000",
        ws: true,
        changeOrigin: true
      }
    }
  }
});
