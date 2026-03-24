import React, { useState } from 'react';
import { adminApi } from '../api/store-admin-client';
import { useAdminI18n } from '../i18n';

const STORAGE_KEY = 'sg_onboarding_done';
export function markOnboardingDone() { localStorage.setItem(STORAGE_KEY, '1'); }
export function isOnboardingDone() { return !!localStorage.getItem(STORAGE_KEY); }

type Step = 'welcome' | 'template' | 'store' | 'bot' | 'delivery' | 'done';

const STEPS: Step[] = ['welcome', 'template', 'store', 'bot', 'delivery', 'done'];

interface IndustryTemplate {
  id: string;
  emoji: string;
  nameRu: string;
  nameUz: string;
  categoriesRu: string[];
  categoriesUz: string[];
}

const TEMPLATES: IndustryTemplate[] = [
  {
    id: 'flowers',
    emoji: '🌸',
    nameRu: 'Цветы',
    nameUz: 'Gullar',
    categoriesRu: ['Букеты', 'Горшечные растения', 'Композиции', 'Аксессуары'],
    categoriesUz: ['Guldastalar', 'Idishli o\'simliklar', 'Kompozitsiyalar', 'Aksessuarlar'],
  },
  {
    id: 'food',
    emoji: '🍕',
    nameRu: 'Еда и доставка',
    nameUz: 'Ovqat va yetkazib berish',
    categoriesRu: ['Горячие блюда', 'Напитки', 'Выпечка', 'Десерты'],
    categoriesUz: ['Issiq taomlar', 'Ichimliklar', 'Pishiriqlar', 'Desertlar'],
  },
  {
    id: 'clothing',
    emoji: '👗',
    nameRu: 'Одежда',
    nameUz: 'Kiyim',
    categoriesRu: ['Женское', 'Мужское', 'Детское', 'Аксессуары'],
    categoriesUz: ['Ayollar', 'Erkaklar', 'Bolalar', 'Aksessuarlar'],
  },
  {
    id: 'electronics',
    emoji: '📱',
    nameRu: 'Электроника',
    nameUz: 'Elektronika',
    categoriesRu: ['Смартфоны', 'Наушники', 'Аксессуары', 'Умный дом'],
    categoriesUz: ['Smartfonlar', 'Quloqchinlar', 'Aksessuarlar', 'Aqlli uy'],
  },
  {
    id: 'beauty',
    emoji: '💄',
    nameRu: 'Красота и уход',
    nameUz: 'Go\'zallik va parvarishlash',
    categoriesRu: ['Уход за лицом', 'Уход за телом', 'Макияж', 'Парфюмерия'],
    categoriesUz: ['Yuz parvarishi', 'Tana parvarishi', 'Makiyaj', 'Atir-upa'],
  },
  {
    id: 'grocery',
    emoji: '🛒',
    nameRu: 'Продукты',
    nameUz: 'Oziq-ovqat',
    categoriesRu: ['Фрукты и овощи', 'Молочное', 'Мясо и рыба', 'Бакалея'],
    categoriesUz: ['Meva va sabzavotlar', 'Sut mahsulotlari', 'Go\'sht va baliq', 'Baqqollik'],
  },
  {
    id: 'blank',
    emoji: '📦',
    nameRu: 'Пустой шаблон',
    nameUz: 'Bo\'sh shablon',
    categoriesRu: [],
    categoriesUz: [],
  },
];

interface Props {
  onFinish: () => void;
}

export default function OnboardingWizard({ onFinish }: Props) {
  const { tr, lang } = useAdminI18n();
  const [step, setStep] = useState<Step>('welcome');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Step: template
  const [selectedTemplate, setSelectedTemplate] = useState<string>('blank');

  // Step: store
  const [storeName, setStoreName] = useState('');
  const [botToken, setBotToken] = useState('');
  const [createdStoreId, setCreatedStoreId] = useState<string | null>(null);

  // Step: bot check
  const [botStatus, setBotStatus] = useState<'idle' | 'checking' | 'ok' | 'error'>('idle');
  const [botInfo, setBotInfo] = useState<any>(null);

  // Step: delivery
  const [deliveryType, setDeliveryType] = useState<'zone' | 'pickup'>('zone');
  const [zoneName, setZoneName] = useState('');
  const [zonePrice, setZonePrice] = useState('0');

  const stepIndex = STEPS.indexOf(step);
  const totalSteps = STEPS.length - 1; // exclude 'done'

  function skip() {
    markOnboardingDone();
    onFinish();
  }

  async function createStore() {
    if (!storeName.trim() || !botToken.trim()) {
      setError(tr('Заполните название и Bot Token', 'Nomi va Bot Token kiriting'));
      return;
    }
    setSaving(true);
    setError('');
    try {
      const store = await adminApi.createStore({ name: storeName.trim(), botToken: botToken.trim() });
      setCreatedStoreId(store.id || store.data?.id);
      setStep('bot');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function checkBot() {
    if (!createdStoreId) return;
    setBotStatus('checking');
    setError('');
    try {
      const data = await adminApi.checkStoreBot(createdStoreId);
      setBotInfo(data);
      setBotStatus('ok');
    } catch (e: any) {
      setBotStatus('error');
      setError(e.message || tr('Бот недоступен. Проверьте токен.', 'Bot mavjud emas. Tokenni tekshiring.'));
    }
  }

  async function activateBot() {
    if (!createdStoreId) return;
    setSaving(true);
    setError('');
    try {
      await adminApi.activateStore(createdStoreId);
      setStep('delivery');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function saveDelivery() {
    setSaving(true);
    setError('');
    try {
      if (deliveryType === 'zone') {
        if (!zoneName.trim()) { setError(tr('Введите название зоны', 'Zona nomini kiriting')); setSaving(false); return; }
        await adminApi.createDeliveryZone({
          name: zoneName.trim(),
          price: parseFloat(zonePrice) || 0,
          storeId: createdStoreId || undefined,
        });
      } else {
        await adminApi.createDeliveryZone({
          name: tr('Самовывоз', 'O\'z-o\'ziga olish'),
          price: 0,
          storeId: createdStoreId || undefined,
        });
      }
      // Apply industry template — create categories
      const tpl = TEMPLATES.find((t) => t.id === selectedTemplate);
      if (tpl && tpl.categoriesRu.length > 0) {
        const names = lang === 'uz' ? tpl.categoriesUz : tpl.categoriesRu;
        for (let i = 0; i < names.length; i++) {
          await adminApi.createCategory({ name: names[i], sortOrder: i });
        }
      }
      setStep('done');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 200,
      background: 'linear-gradient(135deg, #0b1726 0%, #112336 100%)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 16,
    }}>
      <div style={{
        width: '100%', maxWidth: 520,
        background: '#fff', borderRadius: 20,
        padding: '32px 32px 28px',
        boxShadow: '0 24px 64px rgba(0,0,0,0.35)',
        display: 'grid', gap: 20,
      }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#00875a' }}>SellGram</div>
          {step !== 'welcome' && step !== 'done' && (
            <button
              onClick={skip}
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: '#9ca3af' }}
            >
              {tr('Пропустить →', 'O\'tkazib yuborish →')}
            </button>
          )}
        </div>

        {/* Progress bar */}
        {step !== 'welcome' && step !== 'done' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#9ca3af', marginBottom: 6 }}>
              <span>{tr('Шаг', 'Qadam')} {stepIndex} / {totalSteps}</span>
            </div>
            <div style={{ height: 5, background: '#e5e7eb', borderRadius: 999, overflow: 'hidden' }}>
              <div style={{
                height: '100%',
                width: `${(stepIndex / totalSteps) * 100}%`,
                background: 'linear-gradient(90deg, #00875a, #00a86f)',
                transition: 'width .35s ease',
              }} />
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div style={{ background: '#fff2f2', color: '#b52d2d', border: '1px solid #ffd6d6', borderRadius: 10, padding: '10px 12px', fontSize: 13 }}>
            {error}
          </div>
        )}

        {/* ── STEP: WELCOME ── */}
        {step === 'welcome' && (
          <>
            <div style={{ textAlign: 'center', padding: '8px 0' }}>
              <div style={{ fontSize: 52, marginBottom: 12 }}>🚀</div>
              <h2 style={{ margin: 0, fontSize: 26, fontWeight: 800 }}>
                {tr('Добро пожаловать!', 'Xush kelibsiz!')}
              </h2>
              <p style={{ margin: '10px 0 0', color: '#6b7280', fontSize: 15, lineHeight: 1.6 }}>
                {tr(
                  'Настроим ваш Telegram-магазин за несколько шагов.',
                  'Bir necha qadamda Telegram-do\'koningizni sozlaymiz.'
                )}
              </p>
            </div>
            <div style={{ display: 'grid', gap: 10 }}>
              {[
                tr('Подключить Telegram-бота', 'Telegram-botni ulash'),
                tr('Настроить доставку', 'Yetkazib berishni sozlash'),
                tr('Добавить товары', 'Mahsulotlar qo\'shish'),
              ].map((item, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: '#f0faf4', borderRadius: 10, border: '1px solid #bbf0d8' }}>
                  <span style={{ width: 22, height: 22, borderRadius: '50%', background: '#00875a', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, flexShrink: 0 }}>{i + 1}</span>
                  <span style={{ fontSize: 14, fontWeight: 600, color: '#065f46' }}>{item}</span>
                </div>
              ))}
            </div>
            <button
              className="sg-btn primary"
              style={{ width: '100%', padding: '13px 0', fontSize: 16 }}
              onClick={() => setStep('template')}
            >
              {tr('Начать настройку', 'Sozlashni boshlash')} →
            </button>
          </>
        )}

        {/* ── STEP: TEMPLATE ── */}
        {step === 'template' && (
          <>
            <div>
              <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>
                {tr('Выберите шаблон отрасли', 'Soha shablonini tanlang')}
              </h2>
              <p style={{ margin: '6px 0 0', color: '#6b7280', fontSize: 14 }}>
                {tr(
                  'Создадим стартовые категории. Потом можно изменить.',
                  'Boshlang\'ich kategoriyalar yaratiladi. Keyinchalik o\'zgartirish mumkin.'
                )}
              </p>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {TEMPLATES.map((tpl) => {
                const active = selectedTemplate === tpl.id;
                return (
                  <button
                    key={tpl.id}
                    onClick={() => setSelectedTemplate(tpl.id)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '11px 12px', borderRadius: 12, border: '2px solid',
                      borderColor: active ? '#00875a' : '#e5e7eb',
                      background: active ? '#f0faf4' : '#fff',
                      cursor: 'pointer', textAlign: 'left',
                    }}
                  >
                    <span style={{ fontSize: 22, lineHeight: 1 }}>{tpl.emoji}</span>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: active ? '#065f46' : '#111827' }}>
                        {lang === 'uz' ? tpl.nameUz : tpl.nameRu}
                      </div>
                      {tpl.categoriesRu.length > 0 && (
                        <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 1 }}>
                          {tpl.categoriesRu.length} {tr('категорий', 'kategoriya')}
                        </div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
            {selectedTemplate !== 'blank' && (
              <div style={{ background: '#f9fafb', borderRadius: 10, padding: '10px 12px', border: '1px solid #e5e7eb' }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#6b7280', marginBottom: 6 }}>
                  {tr('Будут созданы категории:', 'Kategoriyalar yaratiladi:')}
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {(lang === 'uz'
                    ? TEMPLATES.find((t) => t.id === selectedTemplate)!.categoriesUz
                    : TEMPLATES.find((t) => t.id === selectedTemplate)!.categoriesRu
                  ).map((cat) => (
                    <span key={cat} style={{
                      background: '#e5e7eb', color: '#374151',
                      borderRadius: 6, padding: '3px 8px', fontSize: 12, fontWeight: 500,
                    }}>
                      {cat}
                    </span>
                  ))}
                </div>
              </div>
            )}
            <button
              className="sg-btn primary"
              style={{ width: '100%', padding: '13px 0', fontSize: 15 }}
              onClick={() => setStep('store')}
            >
              {tr('Продолжить', 'Davom etish')} →
            </button>
          </>
        )}

        {/* ── STEP: STORE ── */}
        {step === 'store' && (
          <>
            <div>
              <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>{tr('Создайте магазин', 'Do\'kon yarating')}</h2>
              <p style={{ margin: '6px 0 0', color: '#6b7280', fontSize: 14 }}>
                {tr('Введите название и токен Telegram-бота.', 'Nomi va Telegram-bot tokenini kiriting.')}
              </p>
            </div>
            <div style={{ display: 'grid', gap: 12 }}>
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
                  {tr('Название магазина', 'Do\'kon nomi')} *
                </label>
                <input
                  value={storeName}
                  onChange={(e) => setStoreName(e.target.value)}
                  placeholder={tr('Например: Цветочная лавка', 'Masalan: Gul do\'koni')}
                  style={{ width: '100%', border: '1px solid #d6e0da', borderRadius: 10, padding: '10px 12px', fontSize: 14, boxSizing: 'border-box' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
                  Bot Token *
                </label>
                <input
                  value={botToken}
                  onChange={(e) => setBotToken(e.target.value)}
                  placeholder="123456789:AAF..."
                  style={{ width: '100%', border: '1px solid #d6e0da', borderRadius: 10, padding: '10px 12px', fontSize: 14, fontFamily: 'monospace', boxSizing: 'border-box' }}
                />
                <p style={{ margin: '6px 0 0', fontSize: 12, color: '#6b7280' }}>
                  {tr('Получите у ', 'Oling: ')}
                  <a href="https://t.me/BotFather" target="_blank" rel="noreferrer" style={{ color: '#00875a' }}>@BotFather</a>
                  {tr(' → /newbot', ' → /newbot')}
                </p>
              </div>
            </div>
            <button
              className="sg-btn primary"
              style={{ width: '100%', padding: '12px 0', fontSize: 15 }}
              disabled={saving}
              onClick={createStore}
            >
              {saving ? tr('Создание...', 'Yaratilmoqda...') : tr('Создать магазин', 'Do\'kon yaratish')}
            </button>
          </>
        )}

        {/* ── STEP: BOT CHECK ── */}
        {step === 'bot' && (
          <>
            <div>
              <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>{tr('Проверка бота', 'Botni tekshirish')}</h2>
              <p style={{ margin: '6px 0 0', color: '#6b7280', fontSize: 14 }}>
                {tr('Убедимся, что бот доступен и настроим Web App.', 'Botni tekshirib, Web App-ni sozlaymiz.')}
              </p>
            </div>

            {botStatus === 'idle' && (
              <button className="sg-btn primary" style={{ width: '100%', padding: '12px 0' }} onClick={checkBot}>
                {tr('Проверить бота', 'Botni tekshirish')}
              </button>
            )}

            {botStatus === 'checking' && (
              <div style={{ textAlign: 'center', padding: '16px 0', color: '#6b7280' }}>
                <div className="sg-skeleton" style={{ height: 14, width: '60%', margin: '0 auto' }} />
              </div>
            )}

            {botStatus === 'ok' && botInfo && (
              <>
                <div style={{ background: '#f0faf4', borderRadius: 12, padding: '14px 16px', border: '1px solid #bbf0d8' }}>
                  <div style={{ fontWeight: 700, color: '#065f46', marginBottom: 4 }}>✓ {tr('Бот найден', 'Bot topildi')}</div>
                  <div style={{ fontSize: 13, color: '#3d6b52' }}>
                    @{botInfo.username || botInfo.botUsername || '—'}
                  </div>
                </div>
                <button
                  className="sg-btn primary"
                  style={{ width: '100%', padding: '12px 0' }}
                  disabled={saving}
                  onClick={activateBot}
                >
                  {saving ? tr('Активация...', 'Faollashtirish...') : tr('Активировать и продолжить', 'Faollashtirish va davom etish')}
                </button>
              </>
            )}

            {botStatus === 'error' && (
              <button className="sg-btn ghost" style={{ width: '100%', padding: '12px 0' }} onClick={checkBot}>
                {tr('Попробовать снова', 'Qayta urinish')}
              </button>
            )}
          </>
        )}

        {/* ── STEP: DELIVERY ── */}
        {step === 'delivery' && (
          <>
            <div>
              <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>{tr('Доставка', 'Yetkazib berish')}</h2>
              <p style={{ margin: '6px 0 0', color: '#6b7280', fontSize: 14 }}>
                {tr('Добавьте хотя бы один вариант доставки.', 'Kamida bitta yetkazib berish variantini qo\'shing.')}
              </p>
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              {(['zone', 'pickup'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setDeliveryType(t)}
                  style={{
                    flex: 1, padding: '10px 0', borderRadius: 10, border: '2px solid',
                    borderColor: deliveryType === t ? '#00875a' : '#e5e7eb',
                    background: deliveryType === t ? '#f0faf4' : '#fff',
                    fontWeight: 700, fontSize: 14, cursor: 'pointer',
                    color: deliveryType === t ? '#065f46' : '#6b7280',
                  }}
                >
                  {t === 'zone' ? tr('Доставка', 'Yetkazib berish') : tr('Самовывоз', 'O\'z-o\'ziga olish')}
                </button>
              ))}
            </div>

            {deliveryType === 'zone' && (
              <div style={{ display: 'grid', gap: 10 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
                    {tr('Название зоны', 'Zona nomi')} *
                  </label>
                  <input
                    value={zoneName}
                    onChange={(e) => setZoneName(e.target.value)}
                    placeholder={tr('Например: По городу', 'Masalan: Shaharda')}
                    style={{ width: '100%', border: '1px solid #d6e0da', borderRadius: 10, padding: '10px 12px', fontSize: 14, boxSizing: 'border-box' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
                    {tr('Стоимость (UZS)', 'Narx (UZS)')}
                  </label>
                  <input
                    type="number"
                    value={zonePrice}
                    onChange={(e) => setZonePrice(e.target.value)}
                    min={0}
                    style={{ width: '100%', border: '1px solid #d6e0da', borderRadius: 10, padding: '10px 12px', fontSize: 14, boxSizing: 'border-box' }}
                  />
                </div>
              </div>
            )}

            {deliveryType === 'pickup' && (
              <div style={{ background: '#eff6ff', borderRadius: 10, padding: '12px 14px', border: '1px solid #bfdbfe', fontSize: 14, color: '#1d4ed8' }}>
                {tr('Будет создана зона "Самовывоз" с ценой 0.', '"O\'z-o\'ziga olish" zonasi 0 narxda yaratiladi.')}
              </div>
            )}

            <button
              className="sg-btn primary"
              style={{ width: '100%', padding: '12px 0' }}
              disabled={saving}
              onClick={saveDelivery}
            >
              {saving
                ? tr('Сохранение...', 'Saqlanmoqda...')
                : TEMPLATES.find((t) => t.id === selectedTemplate)?.categoriesRu.length
                  ? tr('Сохранить и создать категории', 'Saqlash va kategoriyalar yaratish')
                  : tr('Сохранить и продолжить', 'Saqlash va davom etish')
              }
            </button>
          </>
        )}

        {/* ── STEP: DONE ── */}
        {step === 'done' && (
          <>
            <div style={{ textAlign: 'center', padding: '8px 0' }}>
              <div style={{ fontSize: 56, marginBottom: 12 }}>🎉</div>
              <h2 style={{ margin: 0, fontSize: 26, fontWeight: 800 }}>
                {tr('Магазин готов!', 'Do\'kon tayyor!')}
              </h2>
              <p style={{ margin: '10px 0 0', color: '#6b7280', fontSize: 15, lineHeight: 1.6 }}>
                {tr(
                  'Осталось добавить товары — и можно принимать заказы.',
                  'Endi mahsulotlar qo\'shish va buyurtmalarni qabul qilish mumkin.'
                )}
              </p>
            </div>
            <div style={{ display: 'grid', gap: 10 }}>
              <button
                className="sg-btn primary"
                style={{ width: '100%', padding: '13px 0', fontSize: 15 }}
                onClick={() => {
                  markOnboardingDone();
                  onFinish();
                  window.location.hash = '/products';
                }}
              >
                {tr('Добавить товары →', 'Mahsulotlar qo\'shish →')}
              </button>
              <button
                className="sg-btn ghost"
                style={{ width: '100%', padding: '11px 0' }}
                onClick={() => { markOnboardingDone(); onFinish(); }}
              >
                {tr('Перейти на дашборд', 'Boshqaruv paneliga o\'tish')}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
