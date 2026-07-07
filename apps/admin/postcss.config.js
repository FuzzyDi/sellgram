import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Explicit, cwd-independent path to tailwind.config.js. Without this,
// tailwindcss's own config auto-discovery searches upward from
// process.cwd() — fine for `pnpm -r run build` (cwd = apps/admin), but
// deploy/Dockerfile.admin runs vite from the monorepo root
// (`vite build apps/admin --config apps/admin/vite.config.ts` with
// WORKDIR /app), so the upward search never finds this file (it's in a
// subdirectory, not an ancestor, from that cwd) and Tailwind silently
// falls back to zero content sources — base/reset CSS only, every
// utility class actually used in the app missing. Reproduced locally by
// running the exact same vite command from the repo root.
const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default {
  plugins: {
    tailwindcss: { config: path.join(__dirname, 'tailwind.config.js') },
    autoprefixer: {},
  },
};
