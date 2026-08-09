import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  // A static export: no server, so GitHub Pages can host it and the site keeps
  // the property that made the hand-rolled version cheap to reason about.
  output: 'export',

  // The site lives at <user>.github.io/ux-lang, not at a domain root, so every
  // internal link and asset needs the repository name in front of it. Without
  // this every page 404s in production while working perfectly in dev — the
  // kind of bug you only find after deploying.
  basePath: '/ux-lang',

  // No image optimizer exists on a static host.
  images: { unoptimized: true },

  // Emit `about/index.html` rather than `about.html`, so paths resolve without
  // a server rewriting them.
  trailingSlash: true,

  // The playground imports the toolchain straight out of `../src`, which is
  // outside this app. Raising the workspace root to the repository lets the
  // bundler reach it — and reaching it is the point: the page runs the same
  // modules `bin/ux` does, not a copy compiled for the browser.
  turbopack: { root: join(HERE, '..') },
  outputFileTracingRoot: join(HERE, '..'),
};

export default nextConfig;
