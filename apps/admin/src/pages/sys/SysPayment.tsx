import React, { useEffect, useState } from 'react';
import { systemApi } from '../../api/system-admin-client';
import Card from '../../components/Card';
import Button from '../../components/Button';
import Input from '../../components/Input';

type MethodType = 'bank' | 'card' | 'payme' | 'click' | 'stars';

const METHODS: { type: MethodType; label: string; icon: string; fields: { key: string; label: string; placeholder?: string }[] }[] = [
  {
    type: 'bank',
    label: 'Банковский перевод',
    icon: '🏦',
    fields: [
      { key: 'recipient',  label: 'Получатель',     placeholder: 'ООО "Компания"' },
      { key: 'bank',       label: 'Банк',            placeholder: 'АКБ "Капиталбанк"' },
      { key: 'account',    label: 'Расчётный счёт',  placeholder: '20208000000000000000' },
      { key: 'inn',        label: 'ИНН / ПИНФЛ',     placeholder: '123456789' },
      { key: 'mfo',        label: 'МФО',             placeholder: '00882' },
      { key: 'note',       label: 'Примечание',      placeholder: 'В назначении: оплата тарифа' },
    ],
  },
  {
    type: 'card',
    label: 'Банковская карта',
    icon: '💳',
    fields: [
      { key: 'number', label: 'Номер карты',  placeholder: '8600 0000 0000 0000' },
      { key: 'holder', label: 'Владелец',     placeholder: 'RASHID KARIMOV' },
      { key: 'bank',   label: 'Банк карты',   placeholder: 'Uzcard / Humo' },
      { key: 'note',   label: 'Примечание',   placeholder: 'Сообщите об оплате в поддержку' },
    ],
  },
  {
    type: 'payme',
    label: 'Payme',
    icon: '🔵',
    fields: [
      { key: 'merchantId', label: 'Merchant ID', placeholder: '5e730e8e0b852a417aa49ceb' },
      { key: 'note',       label: 'Примечание',  placeholder: 'Оплата через Payme' },
    ],
  },
  {
    type: 'click',
    label: 'Click',
    icon: '🟢',
    fields: [
      { key: 'merchantId', label: 'Merchant ID', placeholder: '12345' },
      { key: 'serviceId',  label: 'Service ID',  placeholder: '67890' },
      { key: 'note',       label: 'Примечание',  placeholder: 'Оплата через Click' },
    ],
  },
  {
    type: 'stars',
    label: 'Telegram Stars',
    icon: '⭐',
    fields: [
      { key: 'pro',      label: 'Цена PRO (Stars)',      placeholder: '600' },
      { key: 'business', label: 'Цена BUSINESS (Stars)', placeholder: '1200' },
    ],
  },
];

function methodKey(type: MethodType, field: string) {
  return `${type}_${field}`;
}

export default function SysPayment() {
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [softMode, setSoftMode] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [softSaving, setSoftSaving] = useState(false);
  const [notice, setNotice] = useState('');

  function showNotice(msg: string) { setNotice(msg); setTimeout(() => setNotice(''), 3000); }

  useEffect(() => {
    Promise.allSettled([
      systemApi.billingSettings().then(setSettings),
      systemApi.softMode().then((r: any) => setSoftMode(r?.enabled ?? false)),
    ]).finally(() => setLoading(false));
  }, []);

  function setField(key: string, value: string) {
    setSettings(prev => ({ ...prev, [key]: value }));
  }

  function toggleMethod(type: MethodType, enabled: boolean) {
    setSettings(prev => ({ ...prev, [`${type}_enabled`]: enabled ? 'true' : 'false' }));
  }

  function isEnabled(type: MethodType) {
    const v = settings[`${type}_enabled`];
    if (v === undefined) return type === 'bank';
    return v === 'true';
  }

  async function saveSettings() {
    setSaving(true);
    try {
      await systemApi.updateBillingSettings(settings);
      showNotice('✅ Настройки оплаты сохранены');
    } catch (e: any) {
      showNotice('❌ ' + e.message);
    } finally {
      setSaving(false);
    }
  }

  async function toggleSoftMode(val: boolean) {
    setSoftSaving(true);
    try {
      await systemApi.updateSoftMode(val);
      setSoftMode(val);
      showNotice(val ? '⚠ Мягкий режим ВКЛЮЧЁН' : '✅ Авто-даунгрейд восстановлен');
    } catch (e: any) {
      showNotice('❌ ' + e.message);
    } finally {
      setSoftSaving(false);
    }
  }

  const enabledCount = METHODS.filter(m => isEnabled(m.type)).length;

  return (
    <div className="p-7 max-w-[860px]">
      {notice && (
        <div className={`fixed top-5 right-5 rounded-token-md px-4 py-2.5 font-bold text-token-sm z-[999] shadow-lg ${notice.startsWith('✅') ? 'bg-success/10 text-success' : notice.startsWith('⚠') ? 'bg-warning/10 text-warning' : 'bg-danger/10 text-danger'}`}>
          {notice}
        </div>
      )}

      <h1 className="mb-1.5 text-token-2xl font-extrabold text-neutral-900">Настройки оплаты</h1>
      <p className="mb-6 text-token-sm text-neutral-500">
        Тенантам показываются только включённые способы. Активно: {enabledCount} из {METHODS.length}.
      </p>

      {loading && <div className="text-neutral-400 text-token-base">Загрузка...</div>}

      {!loading && (
        <>
          <Card
            className="mb-5 flex items-center justify-between gap-4"
            style={{ padding: '16px 20px', background: softMode ? '#fffbeb' : '#fff', border: softMode ? '2px solid #f59e0b' : '1px solid #e5e7eb' }}
          >
            <div>
              <div className="font-bold text-token-base text-neutral-900">⚠ Мягкий режим биллинга</div>
              <div className="text-token-xs text-neutral-500 mt-0.5">Если включён — истёкшие подписки не даунгрейдятся автоматически</div>
            </div>
            <label className="inline-flex items-center gap-2 cursor-pointer font-bold text-token-sm flex-shrink-0">
              <input type="checkbox" checked={softMode} onChange={e => void toggleSoftMode(e.target.checked)} disabled={softSaving}
                className="w-[18px] h-[18px]" style={{ accentColor: '#f59e0b' }} />
              <span className={softMode ? 'text-warning' : 'text-neutral-700'}>{softMode ? 'ВКЛЮЧЁН' : 'Выкл'}</span>
              {softSaving && <span className="text-token-xs text-neutral-400">...</span>}
            </label>
          </Card>

          <Card className="mb-4" style={{ padding: '16px 20px' }}>
            <Input
              label="Email для подтверждений"
              value={settings['email'] ?? ''}
              onChange={e => setField('email', e.target.value)}
              placeholder="billing@example.com"
            />
          </Card>

          <div className="flex flex-col gap-3 mb-5">
            {METHODS.map(({ type, label, icon, fields }) => {
              const enabled = isEnabled(type);
              return (
                <Card key={type} className="overflow-hidden" style={{ padding: 0, border: enabled ? '2px solid #3b82f6' : '1px solid #e5e7eb' }}>
                  <div
                    className={`flex items-center justify-between px-5 py-3.5 cursor-pointer ${enabled ? 'bg-accent-600/5' : 'bg-neutral-50'}`}
                    onClick={() => toggleMethod(type, !enabled)}
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="text-token-xl">{icon}</span>
                      <span className="font-bold text-token-base text-neutral-900">{label}</span>
                    </div>
                    <label className="flex items-center gap-1.5 cursor-pointer" onClick={e => e.stopPropagation()}>
                      <input type="checkbox" checked={enabled} onChange={e => toggleMethod(type, e.target.checked)}
                        className="w-4 h-4" style={{ accentColor: '#3b82f6' }} />
                      <span className={`text-token-xs font-semibold ${enabled ? 'text-accent-600' : 'text-neutral-400'}`}>{enabled ? 'Включён' : 'Выкл'}</span>
                    </label>
                  </div>

                  {enabled && (
                    <div className="px-5 py-4 grid grid-cols-2 gap-3">
                      {fields.map(({ key, label: flabel, placeholder }) => (
                        <div key={key} className={key === 'note' || key === 'merchantId' ? 'col-span-2' : undefined}>
                          <Input
                            label={flabel}
                            value={settings[methodKey(type, key)] ?? ''}
                            onChange={e => setField(methodKey(type, key), e.target.value)}
                            placeholder={placeholder}
                          />
                        </div>
                      ))}
                    </div>
                  )}
                </Card>
              );
            })}
          </div>

          <Button variant="primary" size="lg" onClick={saveSettings} disabled={saving}>
            {saving ? 'Сохранение...' : 'Сохранить'}
          </Button>
        </>
      )}
    </div>
  );
}
