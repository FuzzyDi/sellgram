import React, { useEffect, useState } from 'react';
import { systemApi } from '../../api/system-admin-client';

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

  const planColors: Record<string, string> = { FREE: '#64748b', PRO: '#7c3aed', BUSINESS: '#d97706' };

  return (
    <div style={{ padding: 28, maxWidth: 1000 }}>
      {notice && (
        <div style={{ position: 'fixed', top: 20, right: 20, background: notice.startsWith('✅') ? '#d1fae5' : '#fee2e2', borderRadius: 8, padding: '10px 16px', fontWeight: 700, fontSize: 13, color: notice.startsWith('✅') ? '#065f46' : '#991b1b', zIndex: 999, boxShadow: '0 4px 16px rgba(0,0,0,0.1)' }}>{notice}</div>
      )}

      <h1 style={{ margin: '0 0 8px', fontSize: 22, fontWeight: 800, color: '#0f172a' }}>Управление тарифами</h1>
      <p style={{ margin: '0 0 24px', fontSize: 13, color: '#64748b' }}>
        Изменения применяются сразу и кешируются на 5 мин. Новые тенанты получат обновлённые лимиты немедленно.
      </p>

      {loading && <div style={{ color: '#94a3b8', fontSize: 14 }}>Загрузка...</div>}

      {!loading && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 20 }}>
          {PLAN_CODES.map((code) => {
            const cfg = configs[code] || {};
            const edit = edits[code] || {};
            const limits = edit.limits || cfg.limits || {};
            const color = planColors[code] || '#64748b';

            return (
              <div key={code} style={{ background: '#fff', borderRadius: 12, padding: '20px 24px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', borderTop: `4px solid ${color}` }}>
                <div style={{ fontWeight: 800, fontSize: 18, color, marginBottom: 16 }}>{code}</div>

                {/* Price */}
                <div style={{ marginBottom: 16 }}>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 5 }}>
                    Цена (UZS/мес)
                  </label>
                  <input
                    type="number"
                    value={edit.price ?? cfg.price ?? 0}
                    onChange={e => setEditField(code, 'price', e.target.value)}
                    style={{ width: '100%', boxSizing: 'border-box', border: '1px solid #d1d5db', borderRadius: 8, padding: '8px 10px', fontSize: 14, fontWeight: 700 }}
                  />
                </div>

                {/* Limits */}
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 10 }}>Лимиты</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {Object.keys(LIMIT_LABELS).map((key) => {
                      const val = limits[key];
                      const isBoolean = typeof val === 'boolean' || val === 'true' || val === 'false';
                      const label = LIMIT_LABELS[key];

                      return (
                        <div key={key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                          <label style={{ fontSize: 12, color: '#374151', flex: 1 }}>{label}</label>
                          {isBoolean ? (
                            <select
                              value={String(val)}
                              onChange={e => setLimitField(code, key, e.target.value)}
                              style={{ border: '1px solid #d1d5db', borderRadius: 6, padding: '4px 6px', fontSize: 12, width: 70 }}
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
                              style={{ border: '1px solid #d1d5db', borderRadius: 6, padding: '4px 8px', fontSize: 12, width: 70, textAlign: 'right' }}
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
                  style={{ width: '100%', background: color, color: '#fff', border: 'none', borderRadius: 8, padding: '9px', fontWeight: 700, fontSize: 13, cursor: saving === code ? 'not-allowed' : 'pointer', opacity: saving === code ? 0.7 : 1 }}
                >
                  {saving === code ? 'Сохранение...' : 'Сохранить'}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
