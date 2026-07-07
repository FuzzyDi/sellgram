import React, { useEffect, useState } from 'react';
import { adminApi } from '../../api/store-admin-client';
import { useAdminI18n } from '../../i18n';
import type { TabProps } from './types';

export default function LoyaltyTab({ onNotice }: TabProps) {
  const { tr } = useAdminI18n();
  const [loyalty, setLoyalty] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const loyaltyConfig = await adminApi.getLoyaltyConfig();
      setLoyalty(loyaltyConfig);
    } catch (err: any) {
      onNotice('error', err?.message || tr('Ошибка при загрузке настроек', 'Sozlamalarni yuklashda xato'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function saveLoyalty() {
    if (saving) return;
    setSaving(true);
    try {
      await adminApi.updateLoyaltyConfig(loyalty);
      onNotice('success', tr('Сохранено', 'Saqlandi'));
      await load();
    } catch (err: any) {
      onNotice('error', err?.message || tr('Ошибка', 'Xatolik'));
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <section className="sg-page sg-grid" style={{ gap: 16 }}>
        <div className="sg-card" style={{ padding: 0, overflow: 'hidden' }}>
          {[1, 2].map((i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 16px', borderBottom: '1px solid #edf2ee' }}>
              <div style={{ flex: 1 }}>
                <div className="sg-skeleton" style={{ height: 16, width: '40%' }} />
                <div className="sg-skeleton" style={{ height: 12, width: '25%', marginTop: 6 }} />
              </div>
            </div>
          ))}
        </div>
      </section>
    );
  }

  if (!loyalty) return null;

  return (
    <section className="sg-grid" style={{ gap: 12, maxWidth: 760 }}>
      {/* Base settings */}
      <article className="sg-card">
        <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>{tr('Программа лояльности', 'Loyallik dasturi')}</h3>
        <p className="sg-subtitle">{tr('Начисление баллов и лимиты скидки', 'Ball berish qoidalari va chegirma limitlari')}</p>
        <form onSubmit={(e) => { e.preventDefault(); void saveLoyalty(); }} className="sg-grid" style={{ gap: 12, marginTop: 10 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 }}>
            <input type="checkbox" checked={!!loyalty.isEnabled} onChange={(e) => setLoyalty({ ...loyalty, isEnabled: e.target.checked })} />
            {tr('Включена', 'Yoqilgan')}
          </label>
          <div className="sg-grid cols-2">
            <div>
              <label style={{ display: 'block', fontSize: 12, color: '#5f6d64', marginBottom: 6 }}>{tr('Сумма шага', 'Qadam summasi')}</label>
              <input type="number" value={loyalty.unitAmount || 1000} onChange={(e) => setLoyalty({ ...loyalty, unitAmount: +e.target.value })} style={{ border: '1px solid #d6e0da', borderRadius: 10, padding: '9px 11px', width: '100%', boxSizing: 'border-box' }} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, color: '#5f6d64', marginBottom: 6 }}>{tr('Баллов за шаг', 'Qadam uchun ball')}</label>
              <input type="number" value={loyalty.pointsPerUnit || 1} onChange={(e) => setLoyalty({ ...loyalty, pointsPerUnit: +e.target.value })} style={{ border: '1px solid #d6e0da', borderRadius: 10, padding: '9px 11px', width: '100%', boxSizing: 'border-box' }} />
            </div>
          </div>
          <div className="sg-grid cols-2">
            <div>
              <label style={{ display: 'block', fontSize: 12, color: '#5f6d64', marginBottom: 6 }}>{tr('Цена 1 балла (сум)', "1 ball qiymati (so'm)")}</label>
              <input type="number" value={loyalty.pointValue || 100} onChange={(e) => setLoyalty({ ...loyalty, pointValue: +e.target.value })} style={{ border: '1px solid #d6e0da', borderRadius: 10, padding: '9px 11px', width: '100%', boxSizing: 'border-box' }} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, color: '#5f6d64', marginBottom: 6 }}>{tr('Макс. скидка %', 'Maks. chegirma %')}</label>
              <input type="number" value={loyalty.maxDiscountPct || 30} onChange={(e) => setLoyalty({ ...loyalty, maxDiscountPct: +e.target.value })} style={{ border: '1px solid #d6e0da', borderRadius: 10, padding: '9px 11px', width: '100%', boxSizing: 'border-box' }} />
            </div>
          </div>
          <button className="sg-btn primary" type="submit" disabled={saving}>
            {saving ? '...' : tr('Сохранить', 'Saqlash')}
          </button>
        </form>
      </article>

      {/* Tiers */}
      <article className="sg-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>{tr('Уровни лояльности', 'Loyallik darajalari')}</h3>
            <p className="sg-subtitle" style={{ margin: '4px 0 0' }}>{tr('Множитель баллов растёт с суммой покупок', "Ball ko'paytmasi umumiy xarid bilan o'sadi")}</p>
          </div>
          <button
            className="sg-btn ghost"
            type="button"
            style={{ fontSize: 12 }}
            onClick={() => {
              const tiers = [...(loyalty.tiers || [])];
              tiers.push({ name: 'New', nameUz: 'Yangi', minSpend: 0, multiplier: 1, color: '#cd7f32' });
              setLoyalty({ ...loyalty, tiers });
            }}
          >
            + {tr('Добавить', "Qo'shish")}
          </button>
        </div>
        <div style={{ display: 'grid', gap: 8 }}>
          {(loyalty.tiers || []).map((tier: any, idx: number) => (
            <div key={idx} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 80px 80px 36px 36px', gap: 6, alignItems: 'center', background: '#f9fafb', borderRadius: 10, padding: '8px 10px' }}>
              <input
                value={tier.name}
                onChange={(e) => {
                  const tiers = [...loyalty.tiers];
                  tiers[idx] = { ...tiers[idx], name: e.target.value };
                  setLoyalty({ ...loyalty, tiers });
                }}
                placeholder="Bronze"
                style={{ border: '1px solid #d6e0da', borderRadius: 8, padding: '5px 8px', fontSize: 13 }}
              />
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <input
                  type="color"
                  value={tier.color || '#cd7f32'}
                  onChange={(e) => {
                    const tiers = [...loyalty.tiers];
                    tiers[idx] = { ...tiers[idx], color: e.target.value };
                    setLoyalty({ ...loyalty, tiers });
                  }}
                  style={{ width: 28, height: 28, border: 'none', borderRadius: 6, cursor: 'pointer', padding: 0 }}
                />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 10, color: '#9ca3af', marginBottom: 2 }}>{tr('от суммы', 'summadan')}</div>
                  <input
                    type="number"
                    value={tier.minSpend}
                    min={0}
                    onChange={(e) => {
                      const tiers = [...loyalty.tiers];
                      tiers[idx] = { ...tiers[idx], minSpend: +e.target.value };
                      setLoyalty({ ...loyalty, tiers });
                    }}
                    style={{ border: '1px solid #d6e0da', borderRadius: 8, padding: '4px 6px', fontSize: 12, width: '100%', boxSizing: 'border-box' }}
                  />
                </div>
              </div>
              <div>
                <div style={{ fontSize: 10, color: '#9ca3af', marginBottom: 2 }}>{tr('множитель', "ko'paytma")}</div>
                <input
                  type="number"
                  value={tier.multiplier}
                  min={0.1}
                  step={0.1}
                  onChange={(e) => {
                    const tiers = [...loyalty.tiers];
                    tiers[idx] = { ...tiers[idx], multiplier: +e.target.value };
                    setLoyalty({ ...loyalty, tiers });
                  }}
                  style={{ border: '1px solid #d6e0da', borderRadius: 8, padding: '4px 6px', fontSize: 12, width: '100%', boxSizing: 'border-box' }}
                />
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 10, color: '#9ca3af', marginBottom: 2 }}>x</div>
                <span style={{ fontSize: 14, fontWeight: 700, color: tier.color || '#cd7f32' }}>{tier.multiplier}×</span>
              </div>
              <button
                type="button"
                className="sg-btn ghost"
                style={{ fontSize: 11, padding: '4px 6px' }}
                disabled={(loyalty.tiers || []).length <= 1}
                onClick={() => {
                  const tiers = loyalty.tiers.filter((_: any, i: number) => i !== idx);
                  setLoyalty({ ...loyalty, tiers });
                }}
              >
                ✕
              </button>
              <button
                type="button"
                className="sg-btn primary"
                style={{ fontSize: 11, padding: '4px 6px' }}
                disabled={saving}
                onClick={() => void saveLoyalty()}
              >
                ✓
              </button>
            </div>
          ))}
        </div>
      </article>

      {/* Referral program */}
      <article className="sg-card">
        <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, marginBottom: 4 }}>{tr('Реферальная программа', 'Referal dasturi')}</h3>
        <p className="sg-subtitle" style={{ marginBottom: 12 }}>
          {tr('Клиент получает код, делится с друзьями. Бонус — после первого заказа друга.', "Mijoz kod oladi, do'stlariga ulashadi. Bonus — do'stning birinchi buyurtmasidan keyin.")}
        </p>
        <div style={{ display: 'grid', gap: 10 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 }}>
            <input
              type="checkbox"
              checked={!!loyalty.referralEnabled}
              onChange={(e) => setLoyalty({ ...loyalty, referralEnabled: e.target.checked })}
            />
            {tr('Реферальная программа включена', 'Referal dasturi yoqilgan')}
          </label>
          {loyalty.referralEnabled && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, maxWidth: 440 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, color: '#5f6d64', marginBottom: 6 }}>
                  {tr('Бонус тому, кто пригласил (баллов)', 'Taklif qiluvchiga bonus (ball)')}
                </label>
                <input
                  type="number"
                  value={loyalty.referralBonus ?? 500}
                  min={0}
                  onChange={(e) => setLoyalty({ ...loyalty, referralBonus: +e.target.value })}
                  style={{ border: '1px solid #d6e0da', borderRadius: 10, padding: '9px 11px', width: '100%', boxSizing: 'border-box' }}
                />
                <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>
                  {tr('Начисляется после первого заказа друга', "Do'stning birinchi buyurtmasidan keyin")}
                </div>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, color: '#5f6d64', marginBottom: 6 }}>
                  {tr('Бонус приглашённому (баллов)', 'Taklif qilinganga bonus (ball)')}
                </label>
                <input
                  type="number"
                  value={loyalty.referralFriendBonus ?? 0}
                  min={0}
                  onChange={(e) => setLoyalty({ ...loyalty, referralFriendBonus: +e.target.value })}
                  style={{ border: '1px solid #d6e0da', borderRadius: 10, padding: '9px 11px', width: '100%', boxSizing: 'border-box' }}
                />
                <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>
                  {tr('0 = не начислять другу', "0 = do'stga berilmaydi")}
                </div>
              </div>
            </div>
          )}
          <button className="sg-btn primary" type="button" disabled={saving} onClick={() => void saveLoyalty()}>
            {saving ? '...' : tr('Сохранить', 'Saqlash')}
          </button>
        </div>
      </article>
    </section>
  );
}
