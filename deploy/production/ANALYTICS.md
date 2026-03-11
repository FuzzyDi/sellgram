# SellGram Analytics Setup

## Supported Providers
- Google Analytics 4 via `GA_MEASUREMENT_ID`
- Yandex Metrika via `YANDEX_METRIKA_ID`

The landing page injects provider scripts at runtime from [`.env.prod`](/E:/Projects/sellgram/deploy/production/.env.prod). No HTML edits are required for switching providers.

## Production Env
Set one of these in [`.env.prod`](/E:/Projects/sellgram/deploy/production/.env.prod):

```env
GA_MEASUREMENT_ID=G-XXXXXXXXXX
```

or

```env
YANDEX_METRIKA_ID=12345678
```

You can also set both if needed.

## Tracked Events
Current landing events:

- `header_cta_click`
- `mobile_menu_cta_click`
- `hero_cta_click`
- `hero_secondary_cta_click`
- `how_it_works_cta_click`
- `pricing_free_click`
- `pricing_pro_click`
- `pricing_business_click`
- `final_cta_click`
- `final_secondary_cta_click`

## Recommended Goals
Create these as primary conversion goals in GA4 or Metrika:

- `hero_cta_click`
- `pricing_pro_click`
- `final_cta_click`

Secondary funnel events:

- `header_cta_click`
- `mobile_menu_cta_click`
- `hero_secondary_cta_click`
- `how_it_works_cta_click`
- `pricing_free_click`
- `pricing_business_click`
- `final_secondary_cta_click`

## Apply Changes
After updating env values:

```bash
cd /opt/sellgram/deploy/production
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d api nginx
```

## Verify
Open the landing page and confirm your analytics provider receives one of the CTA events after a click.
