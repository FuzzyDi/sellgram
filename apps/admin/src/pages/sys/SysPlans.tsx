import React, { useEffect, useState } from 'react';
import { systemApi } from '../../api/system-admin-client';
import Card from '../../components/Card';
import Input from '../../components/Input';

const PLAN_CODES = ['FREE', 'PRO', 'BUSINESS'];

const LIMIT_LABELS: Record<string, string> = {
  maxStores: 'Магазинов',
  maxProducts: 'Товаров',
  maxOrdersPerMonth: 'Заказов/мес',
  maxDeliveryZones: 'Зон доставки',
  loyaltyEnabled: 'Программа лояльности',
  procurementEnabled: 'Закупки',
  webhooksEnabled: 'Webhooks',
  maxScheduledReports: 'Расписан. отчётов',
};

export default function SysPlans() {
  const [configs, setConfigs] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const [edits, setEdits] = useState<Record<string, any>>({});

  function showNotice(msg: string) { setNotice(msg); setTimeout(() => setNotice(''), 3000); }

  useEffect(() => {
    systemApi.planConfigs().then((data) => {
      setConfigs(data);
      // Initialize edits with current values
      const init: Record<string, any> = {};
      for (const code of PLAN_CODES) {
        const cfg = data[code] || {};
        init[code] = {
          price: cfg.price ?? 0,
          limits: { ...(cfg.limits || {}) },
        };
      }
      setEdits(init);
    }).finally(() => setLoading(false));
  }, []);

  function setEditField(code: string, field: string, value: any) {
    setEdits(prev => ({ ...prev, [code]: { ...prev[code], [field]: value } }));
  }

  function setLimitField(code: string, key: string, value: any) {
    setEdits(prev => ({
      ...prev,
      [code]: {
        ...prev[code],
        limits: { ...(prev[code]?.limits || {}), [key]: value },
      },
    }));
  }

  async function savePlan(code: string) {
    setSaving(code);
    try {
      const patch: any = {};
      const edit = edits[code];
      if (edit?.price !== undefined) patch.price = Number(edit.price);
      if (edit?.limits) {
        const limits: Record<string, any> = {};
        for (const [k, v] of Object.entries(edit.limits)) {
          if (typeof v === 'string') {
            if (v === 'true') limits[k] = true;
            else if (v === 'false') limits[k] = false;
            else if (v === '∞' || v === '' || v === '-1') limits[k] = -1;
            else if (!isNaN(Number(v))) limits[k] = Number(v);
            else limits[k] = v;
          } else {
            limits[k] = v;
          }
        }
        patch.limits = limits;
      }
      const updated = await systemApi.updatePlanConfig(code, patch);
      setConfigs(prev => ({ ...prev, [code]: updated }));
      showNotice(`✅ ${code} обновлён`);
    } catch (e: any) {
      showNotice('❌ ' + e.message);
    } finally {
      setSaving(null);
    }
  }

  // Per-plan brand colors, not a status/semantic variant — Button's fixed
  // 4-variant palette and Badge don't have a slot for "this specific
  // plan's identity color", so these stay inline (the borderTop accent
  // and the save button both need a color no shared component expresses).
  const planColors: Record<string, string> = { FREE: '#64748b', PRO: '#7c3aed', BUSINESS: '#d97706' };

  return (
    <div className="p-7 max-w-[1000px]">
      {notice && (
        <div className={`fixed top-5 right-5 rounded-token-md px-4 py-2.5 font-bold text-token-sm z-[999] shadow-lg ${notice.startsWith('✅') ? 'bg-success/10 text-success' : 'bg-danger/10 text-danger'}`}>
          {notice}
        </div>
      )}

      <h1 className="mb-2 text-token-2xl font-extrabold text-neutral-900">Управление тарифами</h1>
      <p className="mb-6 text-token-sm text-neutral-500">
        Изменения применяются сразу и кешируются на 5 мин. Новые тенанты получат обновлённые лимиты немедленно.
      </p>

      {loading && <div className="text-neutral-400 text-token-base">Загрузка...</div>}

      {!loading && (
        <div className="grid grid-cols-3 gap-5">
          {PLAN_CODES.map((code) => {
            const cfg = configs[code] || {};
            const edit = edits[code] || {};
            const limits = edit.limits || cfg.limits || {};
            const color = planColors[code] || '#64748b';

            return (
              <Card key={code} style={{ padding: '20px 24px', borderTop: `4px solid ${color}` }}>
                <div className="font-extrabold text-token-xl mb-4" style={{ color }}>{code}</div>

                <div className="mb-4">
                  <Input
                    label="Цена (UZS/мес)"
                    type="number"
                    value={edit.price ?? cfg.price ?? 0}
                    onChange={e => setEditField(code, 'price', e.target.value)}
                  />
                </div>

                <div className="mb-4">
                  <div className="text-token-xs font-bold text-neutral-700 uppercase tracking-wide mb-2.5">Лимиты</div>
                  <div className="flex flex-col gap-2">
                    {Object.keys(LIMIT_LABELS).map((key) => {
                      const val = limits[key];
                      const isBoolean = typeof val === 'boolean' || val === 'true' || val === 'false';
                      const label = LIMIT_LABELS[key];

                      return (
                        <div key={key} className="flex items-center justify-between gap-2">
                          <label className="text-token-xs text-neutral-700 flex-1">{label}</label>
                          {isBoolean ? (
                            <select
                              value={String(val)}
                              onChange={e => setLimitField(code, key, e.target.value)}
                              className="border border-neutral-300 rounded-token-sm px-1.5 py-1 text-token-xs w-[70px] bg-white focus:outline-none focus:ring-2 focus:ring-accent-500/30 focus:border-accent-500"
                            >
                              <option value="true">Да</option>
                              <option value="false">Нет</option>
                            </select>
                          ) : (
                            <input
                              type="text"
                              value={val === -1 ? '∞' : String(val ?? '')}
                              onChange={e => setLimitField(code, key, e.target.value)}
                              placeholder="∞ или число"
                              className="border border-neutral-300 rounded-token-sm px-2 py-1 text-token-xs w-[70px] text-right focus:outline-none focus:ring-2 focus:ring-accent-500/30 focus:border-accent-500"
                            />
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                <button
                  onClick={() => void savePlan(code)}
                  disabled={saving === code}
                  className={`w-full text-white border-none rounded-token-md py-2.5 font-bold text-token-sm ${saving === code ? 'cursor-not-allowed opacity-70' : 'cursor-pointer'}`}
                  style={{ background: color }}
                >
                  {saving === code ? 'Сохранение...' : 'Сохранить'}
                </button>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
