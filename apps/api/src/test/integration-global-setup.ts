import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const TEST_DB_URL =
  process.env.DATABASE_URL_TEST ??
  'postgresql://sellgram:sellgram_pass@localhost:5433/sellgram_test';

const SCHEMA_DIR = path.resolve(__dirname, '..', '..', '..', '..', 'packages', 'prisma');

export async function setup() {
  execSync(
    `npx prisma db push --force-reset --skip-generate --schema=${SCHEMA_DIR}/schema.prisma`,
    {
      env: { ...process.env, DATABASE_URL: TEST_DB_URL },
      stdio: 'pipe',
    }
  );
}
