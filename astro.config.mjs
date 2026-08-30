// @ts-check
import { defineConfig } from "astro/config";
import react from "@astrojs/react";
import sitemap from "@astrojs/sitemap";
import cloudflare from "@astrojs/cloudflare";
import tailwindcss from "@tailwindcss/vite";
import { env } from "node:process";

// Workaround for Vitest
const isVitest = !!env.VITEST;

// https://astro.build/config
export default defineConfig({
  output: "server",

  site: "https://bond-screener.ptcookie.net",

  integrations: [react(), sitemap()],

  vite: {
    plugins: [tailwindcss()],
  },

  adapter: isVitest ? undefined : cloudflare(),
});
