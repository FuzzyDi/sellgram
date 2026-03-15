import React from 'react';
import { FormState, ProviderCode, PROVIDERS, PROVIDER_HINTS } from './payment-method-model';

const fieldStyle: React.CSSProperties = {
  border: '1px solid #d6e0da',
  borderRadius: 10,
  padding: '9px 11px',
  width: '100%',
  fontSize: 14,
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 12,
  color: '#5f6d64',
  marginBottom: 5,
};

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
    <div className="fixed inset-0 bg-black/45 flex items-center justify-center z-50 p-4">
      <div className="sg-card" style={{ width: '100%', maxWidth: 520, maxHeight: '90vh', overflowY: 'auto' }}>
        <h3 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>
          {editing ? tr('\u0418\u0437\u043c\u0435\u043d\u0438\u0442\u044c \u0441\u043f\u043e\u0441\u043e\u0431 \u043e\u043f\u043b\u0430\u0442\u044b', "To'lov usulini tahrirlash") : tr('\u0421\u043e\u0437\u0434\u0430\u0442\u044c \u0441\u043f\u043e\u0441\u043e\u0431 \u043e\u043f\u043b\u0430\u0442\u044b', "To'lov usulini yaratish")}
        </h3>

        <div className="sg-grid cols-2" style={{ marginTop: 14, gap: 10 }}>
          <div>
            <label style={labelStyle}>Provider</label>
            <select
              value={form.provider}
              onChange={(e) => onProviderChange(e.target.value as ProviderCode)}
              style={fieldStyle}
            >
              {PROVIDERS.map((provider) => <option key={provider} value={provider}>{provider}</option>)}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Code</label>
            <input value={form.code} onChange={(e) => onChange({ code: e.target.value })} style={fieldStyle} />
          </div>
        </div>

        <div style={{ marginTop: 8, fontSize: 12, color: '#5f6d64', background: '#f4f7f5', borderRadius: 8, padding: '8px 12px' }}>
          {lang === 'uz' ? hint.uz : hint.ru}
        </div>

        <div style={{ marginTop: 10 }}>
          <label style={labelStyle}>{tr('\u041d\u0430\u0437\u0432\u0430\u043d\u0438\u0435', 'Nomi')}</label>
          <input value={form.title} onChange={(e) => onChange({ title: e.target.value })} style={fieldStyle} />
        </div>
        <div style={{ marginTop: 10 }}>
          <label style={labelStyle}>{tr('\u041e\u043f\u0438\u0441\u0430\u043d\u0438\u0435', "Ta'rif")}</label>
          <input value={form.description} onChange={(e) => onChange({ description: e.target.value })} style={fieldStyle} />
        </div>
        <div style={{ marginTop: 10 }}>
          <label style={labelStyle}>{tr('\u0418\u043d\u0441\u0442\u0440\u0443\u043a\u0446\u0438\u044f', "Ko'rsatma")}</label>
          <textarea value={form.instructions} onChange={(e) => onChange({ instructions: e.target.value })}
            style={{ ...fieldStyle, resize: 'vertical' }} rows={3} />
        </div>

        {form.provider === 'TELEGRAM' && (
          <div className="sg-grid cols-2" style={{ marginTop: 10, gap: 10 }}>
            <div>
              <label style={labelStyle}>providerToken</label>
              <input value={form.tgProviderToken} onChange={(e) => onChange({ tgProviderToken: e.target.value })} style={fieldStyle} />
            </div>
            <div>
              <label style={labelStyle}>currency</label>
              <input value={form.tgCurrency} onChange={(e) => onChange({ tgCurrency: e.target.value.toUpperCase() })}
                style={fieldStyle} placeholder="UZS" />
            </div>
          </div>
        )}

        {form.provider === 'CLICK' && (
          <div className="sg-grid cols-2" style={{ marginTop: 10, gap: 10 }}>
            <div>
              <label style={labelStyle}>serviceId</label>
              <input value={form.clickServiceId} onChange={(e) => onChange({ clickServiceId: e.target.value })} style={fieldStyle} />
            </div>
            <div>
              <label style={labelStyle}>merchantId</label>
              <input value={form.clickMerchantId} onChange={(e) => onChange({ clickMerchantId: e.target.value })} style={fieldStyle} />
            </div>
            <div>
              <label style={labelStyle}>clickSecret (optional)</label>
              <input value={form.clickSecret} onChange={(e) => onChange({ clickSecret: e.target.value })} style={fieldStyle} />
            </div>
            <div>
              <label style={labelStyle}>webhookSecret (optional)</label>
              <input value={form.clickWebhookSecret} onChange={(e) => onChange({ clickWebhookSecret: e.target.value })} style={fieldStyle} />
            </div>
          </div>
        )}

        {form.provider === 'PAYME' && (
          <div className="sg-grid cols-2" style={{ marginTop: 10, gap: 10 }}>
            <div>
              <label style={labelStyle}>merchantId</label>
              <input value={form.paymeMerchantId} onChange={(e) => onChange({ paymeMerchantId: e.target.value })} style={fieldStyle} />
            </div>
            <div>
              <label style={labelStyle}>paymeAuthKey (optional)</label>
              <input value={form.paymeAuthKey} onChange={(e) => onChange({ paymeAuthKey: e.target.value })} style={fieldStyle} />
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={labelStyle}>webhookSecret (optional)</label>
              <input value={form.paymeWebhookSecret} onChange={(e) => onChange({ paymeWebhookSecret: e.target.value })} style={fieldStyle} />
            </div>
          </div>
        )}

        {['CUSTOM', 'UZUM', 'STRIPE', 'CASH', 'MANUAL_TRANSFER'].includes(form.provider) && (
          <div style={{ marginTop: 10 }}>
            <label style={labelStyle}>Meta JSON</label>
            <textarea
              value={form.customMetaJson}
              onChange={(e) => onChange({ customMetaJson: e.target.value })}
              style={{ ...fieldStyle, fontFamily: 'monospace', fontSize: 12, resize: 'vertical' }}
              rows={5}
              placeholder='{"merchantId":"...","secretKey":"..."}'
            />
          </div>
        )}

        <div className="sg-grid cols-2" style={{ marginTop: 12, gap: 10 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 }}>
            <input type="checkbox" checked={form.isDefault} onChange={(e) => onChange({ isDefault: e.target.checked })} />
            {tr('\u041f\u043e \u0443\u043c\u043e\u043b\u0447\u0430\u043d\u0438\u044e', 'Asosiy')}
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 }}>
            <input type="checkbox" checked={form.isActive} onChange={(e) => onChange({ isActive: e.target.checked })} />
            {tr('\u0410\u043a\u0442\u0438\u0432\u0435\u043d', 'Faol')}
          </label>
        </div>

        <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
          <button
            className="sg-btn primary"
            type="button"
            onClick={onSave}
            disabled={!canSave || saving}
            style={{ flex: 1 }}
          >
            {saving ? tr('\u0421\u043e\u0445\u0440\u0430\u043d\u0435\u043d\u0438\u0435...', 'Saqlanmoqda...') : tr('\u0421\u043e\u0445\u0440\u0430\u043d\u0438\u0442\u044c', 'Saqlash')}
          </button>
          <button className="sg-btn ghost" type="button" onClick={onClose}>
            {tr('\u041e\u0442\u043c\u0435\u043d\u0430', 'Bekor qilish')}
          </button>
        </div>
      </div>
    </div>
  );
}
