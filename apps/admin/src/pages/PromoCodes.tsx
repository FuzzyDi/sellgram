import React, { useEffect, useState } from 'react';
import { adminApi } from '../api/store-admin-client';
import { useAdminI18n } from '../i18n';

export default function PromoCodes() {
  const { tr } = useAdminI18n();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [form, setForm] = useState({ code: '', type: 'PERCENT', value: '', minOrder: '', maxUses: '', expiresAt: '' });
  const [formError, setFormError] = useState('');

  async function load() {
    setLoading(true); setLoadError(false);
    try { setItems((await adminApi.getPromoCodes()).data ?? []); }
    catch { setLoadError(true); }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  async function handleCreate() {
    if (!form.code || !form.value) { setFormError(tr('Заполните код и скидку', "Kod va chegirmani to'ldiring")); return; }
    setSaving(true); setFormError('');
    try {
      await adminApi.createPromoCode({
        code: form.code,
        type: form.type,
        value: Number(form.value),
        minOrder: form.minOrder ? Number(form.minOrder) : undefined,
        maxUses: form.maxUses ? Number(form.maxUses) : undefined,
        expiresAt: form.expiresAt || undefined,
      });
      setShowForm(false);
      setForm({ code: '', type: 'PERCENT', value: '', minOrder: '', maxUses: '', expiresAt: '' });
      await load();
    } catch (e: any) {
      setFormError(e.message || tr('Ошибка', 'Xato'));
    } finally { setSaving(false); }
  }

  async function toggleActive(id: string, isActive: boolean) {
    try { await adminApi.updatePromoCode(id, { isActive: !isActive }); await load(); } catch {}
  }

  async function handleDelete(id: string) {
    try { await adminApi.deletePromoCode(id); setDeleteId(null); await load(); } catch {}
  }

  return (
    <div style={{ maxWidth: 860, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h2 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>{tr('Промокоды', 'Promokodlar')}</h2>
          <p style={{ color: '#6b7280', fontSize: 13, margin: '4px 0 0' }}>{tr('Скидочные коды для клиентов', 'Mijozlar uchun chegirma kodlari')}</p>
        </div>
        <button className="sg-btn sg-btn-primary" onClick={() => { setShowForm(true); setFormError(''); }}>
          + {tr('Создать', 'Yaratish')}
        </button>
      </div>

      {showForm && (
        <div className="sg-card" style={{ padding: 20, marginBottom: 20 }}>
          <h3 style={{ margin: '0 0 16px', fontSize: 15, fontWeight: 700 }}>{tr('Новый промокод', 'Yangi promokod')}</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 4 }}>{tr('Код', 'Kod')} *</label>
              <input className="sg-input" value={form.code} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))} placeholder="SUMMER20" />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 4 }}>{tr('Тип', 'Tur')}</label>
              <select className="sg-input" value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}>
                <option value="PERCENT">% {tr('от суммы', 'summadan')}</option>
                <option value="FIXED">{tr('Фикс. сумма', 'Belgilangan summa')}</option>
              </select>
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 4 }}>{tr('Размер скидки', 'Chegirma miqdori')} *</label>
              <input className="sg-input" type="number" value={form.value} onChange={(e) => setForm((f) => ({ ...f, value: e.target.value }))} placeholder={form.type === 'PERCENT' ? '10' : '5000'} />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 4 }}>{tr('Мин. сумма заказа', 'Min. buyurtma summasi')}</label>
              <input className="sg-input" type="number" value={form.minOrder} onChange={(e) => setForm((f) => ({ ...f, minOrder: e.target.value }))} placeholder="50000" />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 4 }}>{tr('Макс. использований', 'Maks. foydalanish')}</label>
              <input className="sg-input" type="number" value={form.maxUses} onChange={(e) => setForm((f) => ({ ...f, maxUses: e.target.value }))} placeholder={tr('Без лимита', 'Limit yoq')} />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 4 }}>{tr('Действует до', 'Amal qilish muddati')}</label>
              <input className="sg-input" type="date" value={form.expiresAt} onChange={(e) => setForm((f) => ({ ...f, expiresAt: e.target.value }))} />
            </div>
          </div>
          {formError && <p style={{ color: '#b91c1c', fontSize: 13, margin: '0 0 12px' }}>{formError}</p>}
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="sg-btn sg-btn-primary" onClick={handleCreate} disabled={saving}>{saving ? '...' : tr('Сохранить', 'Saqlash')}</button>
            <button className="sg-btn sg-btn-ghost" onClick={() => setShowForm(false)}>{tr('Отмена', 'Bekor')}</button>
          </div>
        </div>
      )}

      {loadError && (
        <div className="sg-card" style={{ padding: 32, textAlign: 'center' }}>
          <p style={{ color: '#b91c1c', marginBottom: 12 }}>{tr('Ошибка загрузки', 'Yuklashda xato')}</p>
          <button className="sg-btn sg-btn-primary" onClick={load}>{tr('Повторить', 'Qayta')}</button>
        </div>
      )}

      {loading && !loadError && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[1, 2, 3].map((i) => <div key={i} className="sg-skeleton" style={{ height: 64, borderRadius: 12 }} />)}
        </div>
      )}

      {!loading && !loadError && items.length === 0 && (
        <div className="sg-card" style={{ padding: 48, textAlign: 'center', color: '#9ca3af' }}>
          <div style={{ fontSize: 36, marginBottom: 8 }}>🏷️</div>
          <p style={{ margin: 0 }}>{tr('Промокодов нет', 'Promokodlar yo\'q')}</p>
        </div>
      )}

      {!loading && !loadError && items.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {items.map((item) => {
            const expired = item.expiresAt && new Date(item.expiresAt) < new Date();
            const exhausted = item.maxUses != null && item.usedCount >= item.maxUses;
            return (
              <div key={item.id} className="sg-card" style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', opacity: (!item.isActive || expired || exhausted) ? 0.6 : 1 }}>
                <span style={{ fontFamily: 'monospace', fontWeight: 800, fontSize: 15, background: '#f0f9ff', color: '#0369a1', padding: '3px 10px', borderRadius: 6 }}>{item.code}</span>
                <span style={{ fontSize: 13, fontWeight: 600, color: '#111' }}>
                  {item.type === 'PERCENT' ? `${item.value}%` : `${Number(item.value).toLocaleString()} UZS`}
                </span>
                {item.minOrderAmount && <span style={{ fontSize: 12, color: '#6b7280' }}>{tr('от', 'dan')} {Number(item.minOrderAmount).toLocaleString()}</span>}
                <span style={{ fontSize: 12, color: '#6b7280' }}>{item.usedCount}{item.maxUses ? `/${item.maxUses}` : ''} {tr('исп.', 'ish.')}</span>
                {item.expiresAt && <span style={{ fontSize: 12, color: expired ? '#b91c1c' : '#6b7280' }}>{tr('до', 'gacha')} {new Date(item.expiresAt).toLocaleDateString()}</span>}
                {(expired || exhausted) && <span style={{ fontSize: 11, fontWeight: 600, color: '#b91c1c', background: '#fef2f2', padding: '2px 8px', borderRadius: 6 }}>{expired ? tr('Истёк', 'Muddati o\'tgan') : tr('Исчерпан', 'Tugagan')}</span>}
                <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
                  <button className={`sg-btn ${item.isActive ? 'sg-btn-ghost' : 'sg-btn-primary'}`} style={{ fontSize: 12 }} onClick={() => toggleActive(item.id, item.isActive)}>
                    {item.isActive ? tr('Выкл.', 'O\'ch.') : tr('Вкл.', 'Yoq.')}
                  </button>
                  {deleteId === item.id
                    ? <>
                        <button className="sg-btn sg-btn-danger" style={{ fontSize: 12 }} onClick={() => handleDelete(item.id)}>{tr('Удалить', 'O\'chirish')}</button>
                        <button className="sg-btn sg-btn-ghost" style={{ fontSize: 12 }} onClick={() => setDeleteId(null)}>{tr('Отмена', 'Bekor')}</button>
                      </>
                    : <button className="sg-btn sg-btn-ghost" style={{ fontSize: 12, color: '#b91c1c' }} onClick={() => setDeleteId(item.id)}>✕</button>
                  }
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
