import React, { useState } from 'react';
import { adminApi } from '../../api/store-admin-client';
import Card from '../../components/Card';
import Button from '../../components/Button';
import Input from '../../components/Input';

interface CreateCustomerModalProps {
  onClose: () => void;
  onCreated: () => void;
  tr: (ru: string, uz: string) => string;
}

// docs/CUSTOMER_LOYALTY.md §10/§13 step 6 — registers a POS-style
// customer (no Telegram account) from the admin, for a cashier/manager
// to hand out a loyalty card to someone who isn't a bot user. Same
// two-field shape as POST /pos/v1/customer (pos-sync/routes.ts) — this
// is the admin-JWT-authenticated counterpart of that endpoint, not a
// different feature.
export default function CreateCustomerModal({ onClose, onCreated, tr }: CreateCustomerModalProps) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [created, setCreated] = useState<any>(null);

  async function submit() {
    if (!name.trim() || !phone.trim()) {
      setError(tr('Заполните имя и телефон', 'Ism va telefonni kiriting'));
      return;
    }
    setSaving(true);
    setError('');
    try {
      const customer = await adminApi.createCustomer({ name: name.trim(), phone: phone.trim() });
      setCreated(customer);
      onCreated();
    } catch (err: any) {
      setError(err?.message || tr('Ошибка сохранения', 'Saqlashda xatolik'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/45 z-[400] flex items-center justify-center p-4">
      <Card className="w-full max-w-[420px]">
        <h3 className="m-0 text-token-lg font-semibold text-neutral-800">
          {tr('Новый клиент', 'Yangi mijoz')}
        </h3>
        <p className="mt-1 text-token-sm text-neutral-500">
          {tr('Для покупателя без Telegram — например, зарегистрированного на кассе', "Telegram'siz mijoz uchun — masalan, kassada ro'yxatdan o'tgan")}
        </p>

        {error && <div className="mt-2.5 bg-danger/5 text-danger border border-danger/30 rounded-token-md px-3 py-2.5 text-token-sm">{error}</div>}

        {created ? (
          <div className="mt-4 flex flex-col gap-3">
            <div className="bg-neutral-50 rounded-token-md p-4 text-center">
              <div className="text-token-xs font-semibold text-neutral-500 uppercase tracking-wide mb-1.5">
                {tr('Карта лояльности', 'Sodiqlik kartasi')}
              </div>
              <div className="text-token-2xl font-bold text-neutral-800 tracking-wide">
                {created.loyaltyCardNumber}
              </div>
            </div>
            <Button variant="primary" size="md" type="button" onClick={onClose}>
              {tr('Готово', 'Tayyor')}
            </Button>
          </div>
        ) : (
          <div className="mt-3 flex flex-col gap-3">
            <Input label={tr('Имя', 'Ism')} value={name} onChange={(e) => setName(e.target.value)} />
            <Input label={tr('Телефон', 'Telefon')} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+998901234567" />
            <div className="flex gap-2 mt-1">
              <Button variant="primary" size="md" type="button" onClick={() => void submit()} disabled={saving}>
                {saving ? tr('Сохранение...', 'Saqlanmoqda...') : tr('Создать', 'Yaratish')}
              </Button>
              <Button variant="ghost" size="md" type="button" onClick={onClose} disabled={saving}>
                {tr('Отмена', 'Bekor qilish')}
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
