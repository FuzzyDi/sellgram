// Run: node scripts/generate-og-image.mjs
// Requires: sharp (npm i sharp) or run on server where sharp is installed

import sharp from 'sharp';
import { writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0d1f16"/>
      <stop offset="100%" stop-color="#0f2b1c"/>
    </linearGradient>
    <linearGradient id="green" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#00875a"/>
      <stop offset="100%" stop-color="#00c47a"/>
    </linearGradient>
    <linearGradient id="card" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#1a3326"/>
      <stop offset="100%" stop-color="#152a1f"/>
    </linearGradient>
    <filter id="glow">
      <feGaussianBlur stdDeviation="18" result="blur"/>
      <feComposite in="SourceGraphic" in2="blur" operator="over"/>
    </filter>
  </defs>

  <!-- Background -->
  <rect width="1200" height="630" fill="url(#bg)"/>

  <!-- Glow circles -->
  <circle cx="200" cy="150" r="280" fill="#00875a" opacity="0.07"/>
  <circle cx="1050" cy="500" r="220" fill="#00c47a" opacity="0.06"/>
  <circle cx="600" cy="630" r="300" fill="#007a51" opacity="0.05"/>

  <!-- Grid lines (subtle) -->
  <g opacity="0.04" stroke="#fff" stroke-width="1">
    <line x1="0" y1="210" x2="1200" y2="210"/>
    <line x1="0" y1="420" x2="1200" y2="420"/>
    <line x1="400" y1="0" x2="400" y2="630"/>
    <line x1="800" y1="0" x2="800" y2="630"/>
  </g>

  <!-- Logo badge -->
  <rect x="72" y="68" width="56" height="56" rx="16" fill="url(#green)"/>
  <text x="100" y="106" text-anchor="middle" font-family="Arial,sans-serif" font-weight="900" font-size="22" fill="#fff">SG</text>

  <!-- Brand name -->
  <text x="144" y="105" font-family="Arial,sans-serif" font-weight="900" font-size="28" fill="#fff" letter-spacing="-0.5">SellGram</text>

  <!-- Main headline -->
  <text x="72" y="220" font-family="Arial,sans-serif" font-weight="900" font-size="72" fill="#fff" letter-spacing="-2">Магазин в Telegram</text>
  <text x="72" y="308" font-family="Arial,sans-serif" font-weight="900" font-size="72" fill="url(#green)" letter-spacing="-2">за 5 минут</text>

  <!-- Subheading -->
  <text x="72" y="378" font-family="Arial,sans-serif" font-weight="500" font-size="28" fill="#8ab89a">Каталог · Заказы · Payme · Click · Лояльность · Аналитика</text>

  <!-- Feature cards -->
  <rect x="72" y="430" width="200" height="88" rx="16" fill="url(#card)" stroke="#2a4a36" stroke-width="1.5"/>
  <text x="162" y="466" text-anchor="middle" font-family="Arial,sans-serif" font-size="26">🆓</text>
  <text x="162" y="492" text-anchor="middle" font-family="Arial,sans-serif" font-weight="800" font-size="15" fill="#fff">Бесплатно</text>
  <text x="162" y="510" text-anchor="middle" font-family="Arial,sans-serif" font-weight="500" font-size="12" fill="#6a9a7a">навсегда</text>

  <rect x="290" y="430" width="200" height="88" rx="16" fill="url(#card)" stroke="#2a4a36" stroke-width="1.5"/>
  <text x="390" y="466" text-anchor="middle" font-family="Arial,sans-serif" font-size="26">⚡</text>
  <text x="390" y="492" text-anchor="middle" font-family="Arial,sans-serif" font-weight="800" font-size="15" fill="#fff">5 минут</text>
  <text x="390" y="510" text-anchor="middle" font-family="Arial,sans-serif" font-weight="500" font-size="12" fill="#6a9a7a">до запуска</text>

  <rect x="508" y="430" width="200" height="88" rx="16" fill="url(#card)" stroke="#2a4a36" stroke-width="1.5"/>
  <text x="608" y="466" text-anchor="middle" font-family="Arial,sans-serif" font-size="26">📦</text>
  <text x="608" y="492" text-anchor="middle" font-family="Arial,sans-serif" font-weight="800" font-size="15" fill="#fff">Без кода</text>
  <text x="608" y="510" text-anchor="middle" font-family="Arial,sans-serif" font-weight="500" font-size="12" fill="#6a9a7a">не нужен сервер</text>

  <!-- Phone mockup (right side) -->
  <rect x="820" y="60" width="310" height="510" rx="36" fill="#1a3326" stroke="#2d5040" stroke-width="2"/>
  <rect x="830" y="70" width="290" height="490" rx="28" fill="#0f2820"/>
  <!-- Phone notch -->
  <rect x="930" y="66" width="80" height="16" rx="8" fill="#1a3326"/>

  <!-- Screen content -->
  <!-- Store header -->
  <rect x="842" y="100" width="266" height="60" rx="12" fill="#1d3a2c"/>
  <rect x="854" y="112" width="36" height="36" rx="10" fill="url(#green)"/>
  <text x="872" y="134" text-anchor="middle" font-family="Arial,sans-serif" font-weight="800" font-size="13" fill="#fff">SG</text>
  <text x="902" y="127" font-family="Arial,sans-serif" font-weight="700" font-size="14" fill="#fff">Мой магазин</text>
  <text x="902" y="145" font-family="Arial,sans-serif" font-weight="400" font-size="11" fill="#6a9a7a">📦 142 товара</text>

  <!-- Product cards -->
  <rect x="842" y="172" width="126" height="130" rx="12" fill="#1d3a2c"/>
  <rect x="842" y="172" width="126" height="80" rx="12" fill="#254535"/>
  <text x="905" y="222" text-anchor="middle" font-family="Arial,sans-serif" font-size="32">👟</text>
  <text x="855" y="268" font-family="Arial,sans-serif" font-weight="700" font-size="12" fill="#fff">Кроссовки</text>
  <text x="855" y="285" font-family="Arial,sans-serif" font-weight="800" font-size="13" fill="#00c47a">299 000 сум</text>

  <rect x="982" y="172" width="126" height="130" rx="12" fill="#1d3a2c"/>
  <rect x="982" y="172" width="126" height="80" rx="12" fill="#254535"/>
  <text x="1045" y="222" text-anchor="middle" font-family="Arial,sans-serif" font-size="32">👗</text>
  <text x="995" y="268" font-family="Arial,sans-serif" font-weight="700" font-size="12" fill="#fff">Платье</text>
  <text x="995" y="285" font-family="Arial,sans-serif" font-weight="800" font-size="13" fill="#00c47a">189 000 сум</text>

  <rect x="842" y="314" width="126" height="130" rx="12" fill="#1d3a2c"/>
  <rect x="842" y="314" width="126" height="80" rx="12" fill="#254535"/>
  <text x="905" y="364" text-anchor="middle" font-family="Arial,sans-serif" font-size="32">🎂</text>
  <text x="855" y="410" font-family="Arial,sans-serif" font-weight="700" font-size="12" fill="#fff">Торт</text>
  <text x="855" y="427" font-family="Arial,sans-serif" font-weight="800" font-size="13" fill="#00c47a">120 000 сум</text>

  <rect x="982" y="314" width="126" height="130" rx="12" fill="#1d3a2c"/>
  <rect x="982" y="314" width="126" height="80" rx="12" fill="#254535"/>
  <text x="1045" y="364" text-anchor="middle" font-family="Arial,sans-serif" font-size="32">💐</text>
  <text x="995" y="410" font-family="Arial,sans-serif" font-weight="700" font-size="12" fill="#fff">Цветы</text>
  <text x="995" y="427" font-family="Arial,sans-serif" font-weight="800" font-size="13" fill="#00c47a">89 000 сум</text>

  <!-- Cart button -->
  <rect x="842" y="456" width="266" height="44" rx="14" fill="url(#green)"/>
  <text x="975" y="483" text-anchor="middle" font-family="Arial,sans-serif" font-weight="800" font-size="16" fill="#fff">🛒 В корзину</text>

  <!-- Domain badge bottom right -->
  <rect x="820" y="590" width="360" height="30" rx="0" fill="transparent"/>
  <text x="1130" y="614" text-anchor="end" font-family="Arial,sans-serif" font-weight="700" font-size="18" fill="#3a6a50">sellgram.uz</text>
</svg>`;

const outputPath = join(__dirname, '../apps/landing/screenshots/og-image.png');

try {
  await sharp(Buffer.from(svg))
    .png()
    .toFile(outputPath);
  console.log('✅ OG image saved to', outputPath);
} catch (err) {
  console.error('❌ Error:', err.message);
  // Fallback: save SVG for manual conversion
  writeFileSync(join(__dirname, '../apps/landing/screenshots/og-image.svg'), svg);
  console.log('SVG saved as fallback');
}
