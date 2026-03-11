import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import { loadConfig, getConfig } from './config/index.js';
import authPlugin from './plugins/auth.js';
import { getRedis } from './lib/redis.js';
import { resolveBucketAndObjectPath } from './lib/s3.js';

function buildAnalyticsSnippet(config: ReturnType<typeof getConfig>) {
  const gaId = config.GA_MEASUREMENT_ID?.trim();
  const metrikaId = config.YANDEX_METRIKA_ID?.trim();
  const scriptParts: string[] = [];

  if (gaId) {
    scriptParts.push(
      `<script async src="https://www.googletagmanager.com/gtag/js?id=${gaId}"></script>`,
      `<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag('js',new Date());gtag('config',${JSON.stringify(gaId)});</script>`
    );
  }

  if (metrikaId) {
    scriptParts.push(
      `<script>(function(m,e,t,r,i,k,a){m[i]=m[i]||function(){(m[i].a=m[i].a||[]).push(arguments)};m[i].l=1*new Date();for(var j=0;j<document.scripts.length;j++){if(document.scripts[j].src===r){return;}}k=e.createElement(t),a=e.getElementsByTagName(t)[0],k.async=1,k.src=r,a.parentNode.insertBefore(k,a)})(window,document,'script','https://mc.yandex.ru/metrika/tag.js','ym');ym(${JSON.stringify(metrikaId)},'init',{clickmap:true,trackLinks:true,accurateTrackBounce:true,webvisor:true});</script>`
    );
  }

  scriptParts.push(
    `<script>window.sellgramTrack=function(eventName){${
      gaId ? `if(window.gtag){window.gtag('event',eventName);}` : ''
    }${
      metrikaId ? `if(window.ym){window.ym(${JSON.stringify(metrikaId)},'reachGoal',eventName);}` : ''
    }};</script>`
  );

  return scriptParts.join('');
}

function renderLandingHtml(html: string, config: ReturnType<typeof getConfig>) {
  return html
    .replaceAll('{{SUPPORT_EMAIL}}', config.SUPPORT_EMAIL)
    .replaceAll('{{PRIVACY_EMAIL}}', config.PRIVACY_EMAIL)
    .replaceAll('{{BILLING_EMAIL}}', config.BILLING_EMAIL)
    .replaceAll('{{LEGAL_ENTITY_NAME}}', config.LEGAL_ENTITY_NAME)
    .replaceAll('{{LEGAL_ENTITY_SHORT_NAME}}', config.LEGAL_ENTITY_SHORT_NAME)
    .replaceAll('{{LEGAL_ENTITY_ADDRESS}}', config.LEGAL_ENTITY_ADDRESS)
    .replaceAll('{{LEGAL_ENTITY_INN}}', config.LEGAL_ENTITY_INN)
    .replace('{{ANALYTICS_SNIPPET}}', buildAnalyticsSnippet(config));
}

async function main() {
  const config = loadConfig();

  const fastify = Fastify({
    trustProxy: config.TRUST_PROXY || config.NODE_ENV === 'production',
    logger: {
      level: 'info',
      transport: {
        target: 'pino-pretty',
        options: { colorize: true, translateTime: 'HH:MM:ss' },
      },
    },
  });

  // CORS
  await fastify.register(cors, {
    origin: [
      config.ADMIN_URL,
      config.MINIAPP_URL,
      // Local dev
      'http://localhost:5173',
      'http://localhost:5174',
      // Production domains
      'https://sellgram.uz',
      'https://app.sellgram.uz',
      'https://miniapp.sellgram.uz',
      'https://api.sellgram.uz',
      'https://admin.sellgram.uz',
    ],
    credentials: true,
  });

  // Auth plugin (decorates fastify.authenticate)
  await fastify.register(authPlugin);

  // Multipart (file uploads — max 5MB)
  await fastify.register(multipart, { limits: { fileSize: 5 * 1024 * 1024 } });

  await fastify.register(rateLimit, {
    global: true,
    max: config.RATE_LIMIT_MAX,
    timeWindow: config.RATE_LIMIT_WINDOW,
    redis: getRedis(),
    skipOnError: true,
    keyGenerator: (request) => request.ip,
    errorResponseBuilder: (_request, context) => ({
      success: false,
      error: `Too many requests. Retry in ${context.after}.`,
    }),
  });

  // Global error handler — prevent leaking internal errors
  fastify.setErrorHandler((error, request, reply) => {
    const statusCode = error.statusCode || 500;

    // Log full error server-side
    if (statusCode >= 500) {
      fastify.log.error(error);
    }

    // Don't leak Prisma / internal errors to client
    const safeMessage = statusCode < 500
      ? error.message
      : 'Internal server error';

    reply.status(statusCode).send({
      success: false,
      error: safeMessage,
    });
  });

  // BigInt JSON serialization (Telegram IDs)
  (BigInt.prototype as any).toJSON = function () {
    return this.toString();
  };

  // ── Landing page + static pages ────────────────────────
  fastify.get('/', { config: { rateLimit: false } }, async (request, reply) => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const file = path.join(process.cwd(), '..', 'landing', 'index.html');
    try {
      const html = fs.readFileSync(file, 'utf-8');
      reply.type('text/html').send(renderLandingHtml(html, config));
    } catch {
      reply.redirect(config.ADMIN_URL);
    }
  });

  fastify.get('/privacy', { config: { rateLimit: false } }, async (request, reply) => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    try {
      const html = fs.readFileSync(path.join(process.cwd(), '..', 'landing', 'privacy.html'), 'utf-8');
      reply.type('text/html').send(renderLandingHtml(html, config));
    } catch { reply.status(404).send('Not found'); }
  });

  fastify.get('/terms', { config: { rateLimit: false } }, async (request, reply) => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    try {
      const html = fs.readFileSync(path.join(process.cwd(), '..', 'landing', 'terms.html'), 'utf-8');
      reply.type('text/html').send(renderLandingHtml(html, config));
    } catch { reply.status(404).send('Not found'); }
  });

  fastify.get('/guide', { config: { rateLimit: false } }, async (request, reply) => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    try {
      const html = fs.readFileSync(path.join(process.cwd(), '..', 'landing', 'guide.html'), 'utf-8');
      reply.type('text/html').send(renderLandingHtml(html, config));
    } catch { reply.status(404).send('Not found'); }
  });

  // Serve landing screenshots
  fastify.get('/screenshots/:file', { config: { rateLimit: false } }, async (request, reply) => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const { file } = request.params as { file: string };
    const safeName = file.replace(/[^a-zA-Z0-9._-]/g, '');
    const filePath = path.join(process.cwd(), '..', 'landing', 'screenshots', safeName);
    try {
      const data = fs.readFileSync(filePath);
      const ext = path.extname(safeName).toLowerCase();
      const mimeMap: Record<string, string> = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };
      reply.header('Cache-Control', 'public, max-age=604800').type(mimeMap[ext] || 'image/jpeg').send(data);
    } catch { reply.status(404).send('Not found'); }
  });

  // Redirect /admin to admin panel
  fastify.get('/admin', { config: { rateLimit: false } }, async (request, reply) => {
    reply.redirect(config.ADMIN_URL);
  });

  // Health check
  fastify.get('/health', { config: { rateLimit: false } }, async () => ({
    status: 'ok',
    timestamp: new Date().toISOString(),
  }));

  // ── Admin API (/api/admin/*) ──────────────────────────────
  const authRoutes = (await import('./modules/auth/routes.js')).default;
  const storeRoutes = (await import('./modules/store/routes.js')).default;
  const productRoutes = (await import('./modules/product/routes.js')).default;
  const categoryRoutes = (await import('./modules/category/routes.js')).default;
  const orderRoutes = (await import('./modules/order/routes.js')).default;
  const customerRoutes = (await import('./modules/customer/routes.js')).default;
  const deliveryRoutes = (await import('./modules/delivery/routes.js')).default;
  const loyaltyRoutes = (await import('./modules/loyalty/routes.js')).default;
  const procurementRoutes = (await import('./modules/procurement/routes.js')).default;
  const analyticsRoutes = (await import('./modules/analytics/routes.js')).default;
  const subscriptionRoutes = (await import('./modules/subscription/routes.js')).default;
  const broadcastRoutes = (await import('./modules/broadcast/routes.js')).default;
  const systemAdminRoutes = (await import('./modules/system-admin/routes.js')).default;

  await fastify.register(
    async (app) => {
      await app.register(authRoutes);
      await app.register(storeRoutes);
      await app.register(productRoutes);
      await app.register(categoryRoutes);
      await app.register(orderRoutes);
      await app.register(customerRoutes);
      await app.register(deliveryRoutes);
      await app.register(loyaltyRoutes);
      await app.register(procurementRoutes);
      await app.register(analyticsRoutes);
      await app.register(subscriptionRoutes);
      await app.register(broadcastRoutes);
    },
    { prefix: '/api/admin' }
  );

  // ── Shop API (/api/shop/*) for Mini App ───────────────────
  const shopApiRoutes = (await import('./modules/bot/shop-api.js')).default;
  await fastify.register(shopApiRoutes, { prefix: '/api' });
  await fastify.register(systemAdminRoutes, { prefix: '/api/system' });

  // ── Image proxy (MinIO → public) ────────────────────────
  fastify.get('/uploads/*', { config: { rateLimit: false } }, async (request, reply) => {
    const rawPath = (request.params as any)['*'] as string;
    try {
      const { getS3 } = await import('./lib/s3.js');
      const { getConfig } = await import('./config/index.js');
      const cfg = getConfig();
      const resolved = resolveBucketAndObjectPath(rawPath);
      const tryBuckets = rawPath === resolved.objectPath
        ? Array.from(new Set([cfg.S3_BUCKET, resolved.bucket, 'sellgram', 'shopbot']))
        : [resolved.bucket];

      let stream: any = null;
      let lastErr: unknown = null;
      for (const bucket of tryBuckets) {
        try {
          stream = await getS3().getObject(bucket, resolved.objectPath);
          break;
        } catch (err) {
          lastErr = err;
        }
      }

      if (!stream) {
        throw lastErr ?? new Error('Object not found');
      }

      reply.header('Cache-Control', 'public, max-age=86400');
      return reply.send(stream);
    } catch {
      return reply.status(404).send({ error: 'Image not found' });
    }
  });

  // ── Telegram Webhook ──────────────────────────────────────
  const botRoutes = (await import('./modules/bot/routes.js')).default;
  await fastify.register(botRoutes);

  // ── Initialize bot instances ──────────────────────────────
  try {
    const { initBotManager } = await import('./bot/bot-manager.js');
    await initBotManager(fastify);
    fastify.log.info('Bot manager initialized');
  } catch (err: any) {
    fastify.log.error(`Bot manager failed: ${err.message}`);
    fastify.log.error(err.stack);
  }

  // ── Start ─────────────────────────────────────────────────
  try {
    await fastify.listen({ port: config.API_PORT, host: '0.0.0.0' });
    fastify.log.info(`🚀 Server running on http://localhost:${config.API_PORT}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
}

main();
