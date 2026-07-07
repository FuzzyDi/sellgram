import React, { useEffect, useState } from 'react';
import { adminApi } from '../../api/store-admin-client';
import { useAdminI18n } from '../../i18n';
import Card from '../../components/Card';
import Button from '../../components/Button';
import Input from '../../components/Input';
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
      <div className="border border-neutral-200 rounded-token-lg overflow-hidden divide-y divide-neutral-200">
        {[1, 2].map((i) => (
          <div key={i} className="p-3.5">
            <div className="h-4 w-2/5 rounded-token-sm bg-neutral-100 animate-pulse" />
            <div className="h-3 w-1/4 rounded-token-sm bg-neutral-100 animate-pulse mt-1.5" />
          </div>
        ))}
      </div>
    );
  }

  if (!loyalty) return null;

  return (
    <section className="flex flex-col gap-3 max-w-[760px]">
      {/* Base settings */}
      <Card>
        <h3 className="m-0 text-token-lg font-semibold text-neutral-800">{tr('Программа лояльности', 'Loyallik dasturi')}</h3>
        <p className="mt-1 text-token-sm text-neutral-500">{tr('Начисление баллов и лимиты скидки', 'Ball berish qoidalari va chegirma limitlari')}</p>
        <form onSubmit={(e) => { e.preventDefault(); void saveLoyalty(); }} className="flex flex-col gap-3 mt-3">
          <label className="flex items-center gap-2 text-token-sm text-neutral-700">
            <input type="checkbox" className="h-4 w-4 accent-accent-600" checked={!!loyalty.isEnabled} onChange={(e) => setLoyalty({ ...loyalty, isEnabled: e.target.checked })} />
            {tr('Включена', 'Yoqilgan')}
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              type="number"
              label={tr('Сумма шага', 'Qadam summasi')}
              value={loyalty.unitAmount || 1000}
              onChange={(e) => setLoyalty({ ...loyalty, unitAmount: +e.target.value })}
            />
            <Input
              type="number"
              label={tr('Баллов за шаг', 'Qadam uchun ball')}
              value={loyalty.pointsPerUnit || 1}
              onChange={(e) => setLoyalty({ ...loyalty, pointsPerUnit: +e.target.value })}
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              type="number"
              label={tr('Цена 1 балла (сум)', "1 ball qiymati (so'm)")}
              value={loyalty.pointValue || 100}
              onChange={(e) => setLoyalty({ ...loyalty, pointValue: +e.target.value })}
            />
            <Input
              type="number"
              label={tr('Макс. скидка %', 'Maks. chegirma %')}
              value={loyalty.maxDiscountPct || 30}
              onChange={(e) => setLoyalty({ ...loyalty, maxDiscountPct: +e.target.value })}
            />
          </div>
          <Button variant="primary" size="md" type="submit" disabled={saving}>
            {saving ? '...' : tr('Сохранить', 'Saqlash')}
          </Button>
        </form>
      </Card>

      {/* Tiers */}
      <Card>
        <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
          <div>
            <h3 className="m-0 text-token-lg font-semibold text-neutral-800">{tr('Уровни лояльности', 'Loyallik darajalari')}</h3>
            <p className="mt-1 text-token-sm text-neutral-500">{tr('Множитель баллов растёт с суммой покупок', "Ball ko'paytmasi umumiy xarid bilan o'sadi")}</p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            type="button"
            onClick={() => {
              const tiers = [...(loyalty.tiers || [])];
              tiers.push({ name: 'New', nameUz: 'Yangi', minSpend: 0, multiplier: 1, color: '#cd7f32' });
              setLoyalty({ ...loyalty, tiers });
            }}
          >
            + {tr('Добавить', "Qo'shish")}
          </Button>
        </div>
        <div className="flex flex-col gap-2">
          {(loyalty.tiers || []).map((tier: any, idx: number) => (
            <div key={idx} className="grid grid-cols-[2fr_2fr_110px_110px_40px_40px] gap-2 items-center bg-neutral-50 rounded-token-md p-2">
              <Input
                value={tier.name}
                onChange={(e) => {
                  const tiers = [...loyalty.tiers];
                  tiers[idx] = { ...tiers[idx], name: e.target.value };
                  setLoyalty({ ...loyalty, tiers });
                }}
                placeholder="Bronze"
              />
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={tier.color || '#cd7f32'}
                  onChange={(e) => {
                    const tiers = [...loyalty.tiers];
                    tiers[idx] = { ...tiers[idx], color: e.target.value };
                    setLoyalty({ ...loyalty, tiers });
                  }}
                  className="h-8 w-8 rounded-token-sm border border-neutral-300 cursor-pointer p-0"
                />
                <div className="flex-1">
                  <div className="text-token-xs text-neutral-400 mb-0.5">{tr('от суммы', 'summadan')}</div>
                  <Input
                    type="number"
                    value={tier.minSpend}
                    min={0}
                    onChange={(e) => {
                      const tiers = [...loyalty.tiers];
                      tiers[idx] = { ...tiers[idx], minSpend: +e.target.value };
                      setLoyalty({ ...loyalty, tiers });
                    }}
                  />
                </div>
              </div>
              <div>
                <div className="text-token-xs text-neutral-400 mb-0.5">{tr('множитель', "ko'paytma")}</div>
                <Input
                  type="number"
                  value={tier.multiplier}
                  min={0.1}
                  step={0.1}
                  onChange={(e) => {
                    const tiers = [...loyalty.tiers];
                    tiers[idx] = { ...tiers[idx], multiplier: +e.target.value };
                    setLoyalty({ ...loyalty, tiers });
                  }}
                />
              </div>
              <div className="text-center">
                <div className="text-token-xs text-neutral-400 mb-0.5">x</div>
                <span className="text-token-base font-semibold" style={{ color: tier.color || '#cd7f32' }}>{tier.multiplier}×</span>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={(loyalty.tiers || []).length <= 1}
                onClick={() => {
                  const tiers = loyalty.tiers.filter((_: any, i: number) => i !== idx);
                  setLoyalty({ ...loyalty, tiers });
                }}
              >
                ✕
              </Button>
              <Button
                type="button"
                variant="primary"
                size="sm"
                disabled={saving}
                onClick={() => void saveLoyalty()}
              >
                ✓
              </Button>
            </div>
          ))}
        </div>
      </Card>

      {/* Referral program */}
      <Card>
        <h3 className="m-0 mb-1 text-token-lg font-semibold text-neutral-800">{tr('Реферальная программа', 'Referal dasturi')}</h3>
        <p className="mb-3 text-token-sm text-neutral-500">
          {tr('Клиент получает код, делится с друзьями. Бонус — после первого заказа друга.', "Mijoz kod oladi, do'stlariga ulashadi. Bonus — do'stning birinchi buyurtmasidan keyin.")}
        </p>
        <div className="flex flex-col gap-3">
          <label className="flex items-center gap-2 text-token-sm text-neutral-700">
            <input
              type="checkbox"
              className="h-4 w-4 accent-accent-600"
              checked={!!loyalty.referralEnabled}
              onChange={(e) => setLoyalty({ ...loyalty, referralEnabled: e.target.checked })}
            />
            {tr('Реферальная программа включена', 'Referal dasturi yoqilgan')}
          </label>
          {loyalty.referralEnabled && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-[440px]">
              <Input
                type="number"
                label={tr('Бонус тому, кто пригласил (баллов)', 'Taklif qiluvchiga bonus (ball)')}
                value={loyalty.referralBonus ?? 500}
                min={0}
                onChange={(e) => setLoyalty({ ...loyalty, referralBonus: +e.target.value })}
                helpText={tr('Начисляется после первого заказа друга', "Do'stning birinchi buyurtmasidan keyin")}
              />
              <Input
                type="number"
                label={tr('Бонус приглашённому (баллов)', 'Taklif qilinganga bonus (ball)')}
                value={loyalty.referralFriendBonus ?? 0}
                min={0}
                onChange={(e) => setLoyalty({ ...loyalty, referralFriendBonus: +e.target.value })}
                helpText={tr('0 = не начислять другу', "0 = do'stga berilmaydi")}
              />
            </div>
          )}
          <Button variant="primary" size="md" type="button" disabled={saving} onClick={() => void saveLoyalty()}>
            {saving ? '...' : tr('Сохранить', 'Saqlash')}
          </Button>
        </div>
      </Card>
    </section>
  );
}
