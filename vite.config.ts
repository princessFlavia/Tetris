import { defineConfig, type Plugin } from "vite";

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Inlines the JS bundle into index.html so the game is a single file you can
 * double-click. Browsers refuse to load external module scripts over file://,
 * but inline module scripts run fine.
 */
function inlineBundle(): Plugin {
  return {
    name: "inline-bundle",
    apply: "build",
    enforce: "post",
    generateBundle(_options, bundle) {
      const html = bundle["index.html"];
      if (html?.type !== "asset" || typeof html.source !== "string") {
        throw new Error("inline-bundle: index.html missing from bundle");
      }
      let source = html.source;
      for (const [fileName, output] of Object.entries(bundle)) {
        if (output.type !== "chunk") continue;
        const scriptTag = new RegExp(`<script[^>]*src="[^"]*${escapeRegExp(fileName)}"[^>]*></script>`);
        if (!scriptTag.test(source)) {
          throw new Error(`inline-bundle: no <script> tag references ${fileName}`);
        }
        // Function replacer so `$` sequences in the bundle aren't treated as patterns.
        source = source.replace(scriptTag, () => `<script type="module">${output.code}</script>`);
        delete bundle[fileName];
      }
      html.source = source;
    },
  };
}

export default defineConfig({
  build: {
    // The preload polyfill only matters for split chunks; we ship one inline script.
    modulePreload: false,
  },
  plugins: [inlineBundle()],
});
