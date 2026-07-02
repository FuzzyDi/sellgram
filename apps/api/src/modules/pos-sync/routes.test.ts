import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';

import posSyncRoutes from './routes.js';

async function buildApp() {
  const app = Fastify();
  await app.register(posSyncRoutes, { prefix: '/api' });
  return app;
}

describe('pos-sync.routes (skeleton)', () => {
  const cases: Array<{ method: 'GET' | 'POST'; url: string }> = [
    { method: 'POST', url: '/api/pos/v1/activate' },
    { method: 'POST', url: '/api/pos/v1/heartbeat' },
    { method: 'GET', url: '/api/pos/v1/catalog/snapshot' },
    { method: 'GET', url: '/api/pos/v1/settings' },
    { method: 'POST', url: '/api/pos/v1/sale-events' },
    { method: 'POST', url: '/api/pos/v1/fiscal-events' },
    { method: 'POST', url: '/api/pos/v1/shift-events' },
  ];

  for (const { method, url } of cases) {
    it(`${method} ${url} returns 501 Not Implemented`, async () => {
      const app = await buildApp();
      const response = await app.inject({ method, url });

      expect(response.statusCode).toBe(501);
      expect(response.json()).toMatchObject({ success: false, error: 'NOT_IMPLEMENTED' });

      await app.close();
    });
  }
});
