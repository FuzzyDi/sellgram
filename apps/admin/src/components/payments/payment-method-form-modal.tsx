import React from 'react';
import Button from '../Button';
import { FormState, ProviderCode, PROVIDERS, PROVIDER_HINTS } from './payment-method-model';

export default function PaymentMethodFormModal(props: {
  open: boolean;
  editing: boolean;
  lang: 'ru' | 'uz';
  tr: (ru: string, uz: string) => string;
  form: FormState;
  canSave: boolean;
  saving: boolean;
  onProviderChange: (provider: ProviderCode) => void;
  onChange: (patch: Partial<FormState>) => void;
  onSave: () => void;
  onClose: () => void;
}) {
  const { open, editing, lang, tr, form, canSave, saving, onProviderChange, onChange, onSave, onClose } = props;

  if (!open) return null;
  const hint = PROVIDER_HINTS[form.provider];

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl max-w-lg w-full p-6 max-h-[90vh] overflow-auto">
        <h3 className="font-bold mb-4">{editing ? tr('Изменить способ оплаты', "To'lov usulini tahrirlash") : tr('Создать способ оплаты', "To'lov usulini yaratish")}</h3>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-gray-500">Provider</label>
            <select
              value={form.provider}
              onChange={(e) => onProviderChange(e.target.value as ProviderCode)}
              className="w-full border rounded-lg px-3 py-2 text-sm"
            >
              {PROVIDERS.map((provider) => <option key={provider} value={provider}>{provider}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-500">Code</label>
            <input value={form.code} onChange={(e) => onChange({ code: e.target.value })}
              className="w-full border rounded-lg px-3 py-2 text-sm" />
          </div>
        </div>

        <div className="mt-2 text-xs text-gray-500 rounded-lg bg-gray-50 px-3 py-2">
          {lang === 'uz' ? hint.uz : hint.ru}
        </div>

        <div className="mt-3">
          <label className="text-xs text-gray-500">{tr('Название', 'Nomi')}</label>
          <input value={form.title} onChange={(e) => onChange({ title: e.target.value })}
            className="w-full border rounded-lg px-3 py-2 text-sm" />
        </div>
        <div className="mt-3">
          <label className="text-xs text-gray-500">{tr('Описание', "Ta'rif")}</label>
          <input value={form.description} onChange={(e) => onChange({ description: e.target.value })}
            className="w-full border rounded-lg px-3 py-2 text-sm" />
        </div>
        <div className="mt-3">
          <label className="text-xs text-gray-500">{tr('Инструкция', "Ko'rsatma")}</label>
          <textarea value={form.instructions} onChange={(e) => onChange({ instructions: e.target.value })}
            className="w-full border rounded-lg px-3 py-2 text-sm" rows={3} />
        </div>

        {form.provider === 'TELEGRAM' && (
          <div className="mt-3 grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-500">providerToken</label>
              <input value={form.tgProviderToken} onChange={(e) => onChange({ tgProviderToken: e.target.value })}
                className="w-full border rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="text-xs text-gray-500">currency</label>
              <input value={form.tgCurrency} onChange={(e) => onChange({ tgCurrency: e.target.value.toUpperCase() })}
                className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="UZS" />
            </div>
          </div>
        )}

        {form.provider === 'CLICK' && (
          <div className="mt-3 grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-500">serviceId</label>
              <input value={form.clickServiceId} onChange={(e) => onChange({ clickServiceId: e.target.value })}
                className="w-full border rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="text-xs text-gray-500">merchantId</label>
              <input value={form.clickMerchantId} onChange={(e) => onChange({ clickMerchantId: e.target.value })}
                className="w-full border rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="text-xs text-gray-500">clickSecret (optional)</label>
              <input value={form.clickSecret} onChange={(e) => onChange({ clickSecret: e.target.value })}
                className="w-full border rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="text-xs text-gray-500">webhookSecret (optional)</label>
              <input value={form.clickWebhookSecret} onChange={(e) => onChange({ clickWebhookSecret: e.target.value })}
                className="w-full border rounded-lg px-3 py-2 text-sm" />
            </div>
          </div>
        )}

        {form.provider === 'PAYME' && (
          <div className="mt-3 grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-500">merchantId</label>
              <input value={form.paymeMerchantId} onChange={(e) => onChange({ paymeMerchantId: e.target.value })}
                className="w-full border rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="text-xs text-gray-500">paymeAuthKey (optional)</label>
              <input value={form.paymeAuthKey} onChange={(e) => onChange({ paymeAuthKey: e.target.value })}
                className="w-full border rounded-lg px-3 py-2 text-sm" />
            </div>
            <div className="col-span-2">
              <label className="text-xs text-gray-500">webhookSecret (optional)</label>
              <input value={form.paymeWebhookSecret} onChange={(e) => onChange({ paymeWebhookSecret: e.target.value })}
                className="w-full border rounded-lg px-3 py-2 text-sm" />
            </div>
          </div>
        )}

        {['CUSTOM', 'UZUM', 'STRIPE', 'CASH', 'MANUAL_TRANSFER'].includes(form.provider) && (
          <div className="mt-3">
            <label className="text-xs text-gray-500">Meta JSON</label>
            <textarea
              value={form.customMetaJson}
              onChange={(e) => onChange({ customMetaJson: e.target.value })}
              className="w-full border rounded-lg px-3 py-2 text-xs font-mono"
              rows={5}
              placeholder='{"merchantId":"...","secretKey":"..."}'
            />
          </div>
        )}

        <div className="mt-3 grid grid-cols-2 gap-3">
          <label className="text-sm flex items-center gap-2">
            <input type="checkbox" checked={form.isDefault} onChange={(e) => onChange({ isDefault: e.target.checked })} />
            {tr('По умолчанию', 'Asosiy')}
          </label>
          <label className="text-sm flex items-center gap-2">
            <input type="checkbox" checked={form.isActive} onChange={(e) => onChange({ isActive: e.target.checked })} />
            {tr('Активен', 'Faol')}
          </label>
        </div>
        <div className="mt-5 flex gap-2">
          <button
            onClick={onSave}
            disabled={!canSave || saving}
            className="flex-1 bg-blue-600 text-white py-2 rounded-lg disabled:opacity-50"
          >
            {saving ? tr('Сохранение...', 'Saqlanmoqda...') : tr('Сохранить', 'Saqlash')}
          </button>
          <Button onClick={onClose} className="px-5 py-2 bg-gray-100 rounded-lg">{tr('Отмена', 'Bekor qilish')}</Button>
        </div>
      </div>
    </div>
  );
}
