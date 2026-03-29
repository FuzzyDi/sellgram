// Run: node scripts/generate-og-image.mjs
// Requires: sharp (npm i sharp) or run on server where sharp is installed

import sharp from 'sharp';
import { writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Font: DejaVu Sans is pre-installed on Debian and supports Cyrillic
const FONT = "'DejaVu Sans', 'Liberation Sans', Arial, sans-serif";

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#e8f5ef"/>
      <stop offset="100%" stop-color="#f0faf4"/>
    </linearGradient>
    <linearGradient id="green" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#00875a"/>
      <stop offset="100%" stop-color="#00b376"/>
    </linearGradient>
    <linearGradient id="greenText" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#00875a"/>
      <stop offset="100%" stop-color="#00b376"/>
    </linearGradient>
  </defs>

  <!-- Background -->
  <rect width="1200" height="630" fill="url(#bg)"/>

  <!-- Decorative circle top-right -->
  <circle cx="1100" cy="-60" r="320" fill="#00875a" opacity="0.06"/>
  <circle cx="80" cy="700" r="260" fill="#00875a" opacity="0.05"/>

  <!-- Top accent bar -->
  <rect x="0" y="0" width="1200" height="6" fill="url(#green)"/>

  <!-- Logo badge -->
  <rect x="72" y="52" width="52" height="52" rx="14" fill="url(#green)"/>
  <text x="98" y="88" text-anchor="middle" font-family="${FONT}" font-weight="bold" font-size="20" fill="#fff">SG</text>

  <!-- Brand name -->
  <text x="138" y="88" font-family="${FONT}" font-weight="bold" font-size="26" fill="#0f2820">SellGram</text>

  <!-- Divider -->
  <rect x="72" y="130" width="60" height="5" rx="3" fill="url(#green)"/>

  <!-- Main headline line 1 -->
  <text x="72" y="210" font-family="${FONT}" font-weight="bold" font-size="68" fill="#0f2820">Магазин в Telegram</text>

  <!-- Main headline line 2 - green -->
  <text x="72" y="292" font-family="${FONT}" font-weight="bold" font-size="68" fill="#00875a">за 5 минут</text>

  <!-- Subheading -->
  <text x="72" y="348" font-family="${FONT}" font-size="24" fill="#4a6b56">Каталог · Заказы · Payme · Click · Лояльность</text>

  <!-- Feature pills -->
  <rect x="72" y="390" width="168" height="44" rx="22" fill="#00875a"/>
  <text x="156" y="418" text-anchor="middle" font-family="${FONT}" font-weight="bold" font-size="16" fill="#fff">Бесплатно навсегда</text>

  <rect x="256" y="390" width="148" height="44" rx="22" fill="#fff" stroke="#c8e0d4" stroke-width="2"/>
  <text x="330" y="418" text-anchor="middle" font-family="${FONT}" font-weight="bold" font-size="16" fill="#0f2820">5 мин до запуска</text>

  <rect x="420" y="390" width="130" height="44" rx="22" fill="#fff" stroke="#c8e0d4" stroke-width="2"/>
  <text x="485" y="418" text-anchor="middle" font-family="${FONT}" font-weight="bold" font-size="16" fill="#0f2820">Без кода</text>

  <!-- URL bottom left -->
  <text x="72" y="590" font-family="${FONT}" font-weight="bold" font-size="20" fill="#00875a">sellgram.uz</text>

  <!-- Phone mockup -->
  <rect x="780" y="40" width="340" height="556" rx="40" fill="#fff" stroke="#d0e8da" stroke-width="2.5"/>
  <rect x="792" y="52" width="316" height="532" rx="30" fill="#f4faf7"/>
  <!-- Notch -->
  <rect x="900" y="40" width="100" height="18" rx="9" fill="#fff"/>

  <!-- Phone screen: header bar -->
  <rect x="792" y="82" width="316" height="56" rx="0" fill="#fff"/>
  <rect x="804" y="94" width="32" height="32" rx="9" fill="url(#green)"/>
  <text x="820" y="115" text-anchor="middle" font-family="${FONT}" font-weight="bold" font-size="12" fill="#fff">SG</text>
  <text x="846" y="107" font-family="${FONT}" font-weight="bold" font-size="14" fill="#0f2820">Мой магазин</text>
  <text x="846" y="124" font-family="${FONT}" font-size="11" fill="#5a8a6a">142 товара</text>
  <!-- Cart icon top right -->
  <text x="1086" y="116" text-anchor="end" font-family="${FONT}" font-size="20" fill="#00875a">◉</text>

  <!-- Divider -->
  <rect x="792" y="138" width="316" height="1" fill="#e0ede6"/>

  <!-- Product card 1 -->
  <rect x="800" y="148" width="144" height="150" rx="14" fill="#fff" stroke="#e0ede6" stroke-width="1.5"/>
  <rect x="800" y="148" width="144" height="92" rx="14" fill="#e8f5ef"/>
  <text x="872" y="208" text-anchor="middle" font-family="${FONT}" font-size="38">👟</text>
  <text x="814" y="258" font-family="${FONT}" font-weight="bold" font-size="13" fill="#0f2820">Кроссовки</text>
  <text x="814" y="278" font-family="${FONT}" font-weight="bold" font-size="13" fill="#00875a">299 000 сум</text>

  <!-- Product card 2 -->
  <rect x="956" y="148" width="144" height="150" rx="14" fill="#fff" stroke="#e0ede6" stroke-width="1.5"/>
  <rect x="956" y="148" width="144" height="92" rx="14" fill="#e8f5ef"/>
  <text x="1028" y="208" text-anchor="middle" font-family="${FONT}" font-size="38">👗</text>
  <text x="970" y="258" font-family="${FONT}" font-weight="bold" font-size="13" fill="#0f2820">Платье</text>
  <text x="970" y="278" font-family="${FONT}" font-weight="bold" font-size="13" fill="#00875a">189 000 сум</text>

  <!-- Product card 3 -->
  <rect x="800" y="310" width="144" height="150" rx="14" fill="#fff" stroke="#e0ede6" stroke-width="1.5"/>
  <rect x="800" y="310" width="144" height="92" rx="14" fill="#e8f5ef"/>
  <text x="872" y="370" text-anchor="middle" font-family="${FONT}" font-size="38">🎂</text>
  <text x="814" y="420" font-family="${FONT}" font-weight="bold" font-size="13" fill="#0f2820">Торт</text>
  <text x="814" y="440" font-family="${FONT}" font-weight="bold" font-size="13" fill="#00875a">120 000 сум</text>

  <!-- Product card 4 -->
  <rect x="956" y="310" width="144" height="150" rx="14" fill="#fff" stroke="#e0ede6" stroke-width="1.5"/>
  <rect x="956" y="310" width="144" height="92" rx="14" fill="#e8f5ef"/>
  <text x="1028" y="370" text-anchor="middle" font-family="${FONT}" font-size="38">💐</text>
  <text x="970" y="420" font-family="${FONT}" font-weight="bold" font-size="13" fill="#0f2820">Цветы</text>
  <text x="970" y="440" font-family="${FONT}" font-weight="bold" font-size="13" fill="#00875a">89 000 сум</text>

  <!-- Cart button -->
  <rect x="800" y="474" width="300" height="46" rx="14" fill="url(#green)"/>
  <text x="950" y="503" text-anchor="middle" font-family="${FONT}" font-weight="bold" font-size="17" fill="#fff">В корзину</text>
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
