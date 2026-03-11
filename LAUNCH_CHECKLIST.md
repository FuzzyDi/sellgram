# SellGram - Launch Checklist

## Done In Code
- [x] Landing `sellgram.uz`
- [x] Admin panel `app.sellgram.uz`
- [x] Mini App `miniapp.sellgram.uz`
- [x] API `api.sellgram.uz`
- [x] Telegram bot + webhook
- [x] Privacy page
- [x] Terms page
- [x] OG tags and favicon
- [x] Manual billing flow
- [x] Multi-tenant registration and isolation
- [x] Pricing tiers: Free / Pro / Business
- [x] Mobile-first layout
- [x] Security fixes and rate limiting
- [x] Production Docker build without Vite dev server
- [x] Production Nginx routing for landing, admin, miniapp, API
- [x] Production bootstrap for MinIO bucket and Prisma schema

## Manual Before Launch

### Critical
- [ ] Fill `Billing details` block in [`.env.prod`](/E:/Projects/sellgram/deploy/production/.env.prod)
- [ ] Fill `Public contact emails` block in [`.env.prod`](/E:/Projects/sellgram/deploy/production/.env.prod)
- [x] Product Demo uses real screenshots from [screenshots](/E:/Projects/sellgram/apps/landing/screenshots)
- [ ] Fill `Auth and encryption`, `Database`, `Redis`, and `S3 / MinIO` blocks in [`.env.prod`](/E:/Projects/sellgram/deploy/production/.env.prod)
- [ ] Add real SSL certificates or restore HTTPS server block in [nginx.prod.conf](/E:/Projects/sellgram/deploy/production/nginx.prod.conf)

### Legal
- [ ] Register legal entity and settlement account
- [ ] Fill `Legal entity` block in [`.env.prod`](/E:/Projects/sellgram/deploy/production/.env.prod)

### Analytics
- [ ] Set `GA_MEASUREMENT_ID` or `YANDEX_METRIKA_ID` in [`.env.prod`](/E:/Projects/sellgram/deploy/production/.env.prod)
- [ ] Add goals: `hero_cta_click`, `pricing_pro_click`, `final_cta_click`
  Use [ANALYTICS.md](/E:/Projects/sellgram/deploy/production/ANALYTICS.md) for event names and setup.

### Operations
- [ ] Configure service auto-start policy on the real server
- [ ] Install PostgreSQL backup cron using [backup.cron.example](/E:/Projects/sellgram/deploy/production/backup.cron.example)
- [ ] Install uptime cron using [monitor-health.cron.example](/E:/Projects/sellgram/deploy/production/monitor-health.cron.example)
- [ ] On Windows Server, create Task Scheduler jobs from [Backup-Db.TaskScheduler.example.ps1](/E:/Projects/sellgram/deploy/production/Backup-Db.TaskScheduler.example.ps1) and [Monitor-Health.TaskScheduler.example.ps1](/E:/Projects/sellgram/deploy/production/Monitor-Health.TaskScheduler.example.ps1)
- [ ] Review `SSL mode`, `Nginx ports`, and `Health monitoring` blocks in [`.env.prod`](/E:/Projects/sellgram/deploy/production/.env.prod)
- [ ] Fill Telegram alert settings in [`.env.prod`](/E:/Projects/sellgram/deploy/production/.env.prod) if alerts are needed
- [ ] Decide whether production should run seed data via `PRISMA_SEED=true`
- [ ] Execute [PRELAUNCH_RUNBOOK.md](/E:/Projects/sellgram/deploy/production/PRELAUNCH_RUNBOOK.md) end-to-end
- [ ] For Windows Server, use [Deploy-Windows.ps1](/E:/Projects/sellgram/deploy/production/Deploy-Windows.ps1) and [Start-Production.ps1](/E:/Projects/sellgram/deploy/production/Start-Production.ps1)

### Marketing
- [ ] Prepare demo store for prospects
- [ ] Publish launch post in Telegram channel
- [ ] Update BotFather description for `@sellgram_uz`
- [ ] Link the bot from the channel profile
