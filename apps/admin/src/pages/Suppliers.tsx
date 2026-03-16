import React, { useEffect, useState } from 'react';
import { adminApi } from '../api/store-admin-client';
import { useAdminI18n } from '../i18n';

type NoticeTone = 'success' | 'error';

export default function Suppliers() {
  const { tr, locale } = useAdminI18n();
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [planBlocked, setPlanBlocked] = useState(false);
  const [notice, setNotice] = useState<{ tone: NoticeTone; message: string } | null>(null);
  const [saving, setSaving] = useState(false);

  // Form state
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [formName, setFormName] = useState('');
  const [formContact, setFormContact] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formAddress, setFormAddress] = useState('');
  const [formNote, setFormNote] = useState('');

  // PO history drill-down
  const [selectedSupplier, setSelectedSupplier] = useState<any | null>(null);
  const [supplierPos, setSupplierPos] = useState<any[]>([]);
  const [loadingPos, setLoadingPos] = useState(false);

  function showNotice(tone: NoticeTone, message: string) {
    setNotice({ tone, message });
    setTimeout(() => setNotice(null), 3200);
  }

  async function load() {
    setLoading(true);
    try {
      const data = await adminApi.getSuppliers();
      setSuppliers(Array.isArray(data) ? data : data.items || []);
    } catch (err: any) {
      if (err?.message?.includes('402') || err?.message?.toLowerCase().includes('plan')) {
        setPlanBlocked(true);
      } else {
        showNotice('error', err?.message || tr('Ошибка загрузки', 'Yuklash xatosi'));
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  function resetForm() {
    setEditId(null);
    setFormName(''); setFormContact(''); setFormPhone('');
    setFormEmail(''); setFormAddress(''); setFormNote('');
    setShowForm(false);
  }

  function openEdit(s: any) {
    setEditId(s.id);
    setFormName(s.name || '');
    setFormContact(s.contactName || '');
    setFormPhone(s.phone || '');
    setFormEmail(s.email || '');
    setFormAddress(s.address || '');
    setFormNote(s.note || '');
    setShowForm(true);
    setSelectedSupplier(null);
  }

  async function submitForm() {
    if (!formName.trim()) {
      showNotice('error', tr('Введите название контрагента', 'Kontragent nomini kiriting'));
      return;
    }
    setSaving(true);
    try {
      const data = {
        name: formName.trim(),
        contactName: formContact.trim() || undefined,
        phone: formPhone.trim() || undefined,
        email: formEmail.trim() || undefined,
        address: formAddress.trim() || undefined,
        note: formNote.trim() || undefined,
      };
      if (editId) {
        await adminApi.updateSupplier(editId, data);
        showNotice('success', tr('Контрагент обновлён', 'Kontragent yangilandi'));
      } else {
        await adminApi.createSupplier(data);
        showNotice('success', tr('Контрагент добавлен', 'Kontragent qo\'shildi'));
      }
      resetForm();
      await load();
    } catch (err: any) {
      showNotice('error', err?.message || tr('Ошибка сохранения', 'Saqlash xatosi'));
    } finally {
      setSaving(false);
    }
  }

  async function archive(id: string, name: string) {
    if (!window.confirm(tr(`Архивировать «${name}»?`, `«${name}»ni arxivlashtirasizmi?`))) return;
    setSaving(true);
    try {
      await adminApi.archiveSupplier(id);
      showNotice('success', tr('Контрагент архивирован', 'Kontragent arxivlandi'));
      await load();
      if (selectedSupplier?.id === id) setSelectedSupplier(null);
    } catch (err: any) {
      showNotice('error', err?.message || tr('Ошибка', 'Xato'));
    } finally {
      setSaving(false);
    }
  }

  async function openHistory(s: any) {
    setSelectedSupplier(s);
    setShowForm(false);
    setLoadingPos(true);
    try {
      const data = await adminApi.getSupplier(s.id);
      setSupplierPos(data.purchaseOrders || []);
    } catch {
      setSupplierPos([]);
    } finally {
      setLoadingPos(false);
    }
  }

  const noticeNode = notice ? (
    <div style={{
      position: 'fixed', top: 18, right: 18, zIndex: 70, minWidth: 280, maxWidth: 440,
      borderRadius: 12, padding: '12px 14px', fontSize: 14, fontWeight: 700,
      boxShadow: '0 12px 28px rgba(0,0,0,0.12)',
      color: notice.tone === 'error' ? '#991b1b' : '#065f46',
      background: notice.tone === 'error' ? '#fee2e2' : '#d1fae5',
      border: `1px solid ${notice.tone === 'error' ? '#fecaca' : '#a7f3d0'}`,
    }} role="status" aria-live="polite">
      {notice.message}
    </div>
  ) : null;

  if (planBlocked) {
    return (
      <section className="sg-page sg-grid" style={{ gap: 16 }}>
        <header><h2 className="sg-title">{tr('Контрагенты', 'Kontragentlar')}</h2></header>
        <div className="sg-card" style={{ textAlign: 'center', padding: '32px 16px' }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>🔒</div>
          <p style={{ margin: 0, fontWeight: 700, fontSize: 16 }}>{tr('Доступно на PRO и BUSINESS', 'PRO va BUSINESS tariflarida mavjud')}</p>
          <p className="sg-subtitle" style={{ marginTop: 6 }}>{tr('Управление контрагентами доступно с тарифом PRO', 'Kontragentlarni boshqarish PRO tarifidan mavjud')}</p>
          <button className="sg-btn primary" style={{ marginTop: 16 }} onClick={() => (window.location.hash = '/billing')}>
            {tr('Обновить тариф', 'Tarifni yangilash')}
          </button>
        </div>
      </section>
    );
  }

  if (loading) {
    return (
      <section className="sg-page sg-grid" style={{ gap: 16 }}>
        <div>
          <div className="sg-skeleton" style={{ height: 28, width: '35%' }} />
          <div className="sg-skeleton" style={{ height: 14, width: '50%', marginTop: 8 }} />
        </div>
        {[1, 2, 3].map((i) => (
          <div key={i} className="sg-card" style={{ padding: 14 }}>
            <div className="sg-skeleton" style={{ height: 18, width: '40%', marginBottom: 8 }} />
            <div className="sg-skeleton" style={{ height: 14, width: '65%' }} />
          </div>
        ))}
      </section>
    );
  }

  return (
    <section className="sg-page sg-grid" style={{ gap: 16 }}>
      {noticeNode}

      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h2 className="sg-title">{tr('Контрагенты', 'Kontragentlar')}</h2>
          <p className="sg-subtitle">{tr('Поставщики и история заказов', 'Yetkazib beruvchilar va buyurtmalar tarixi')}</p>
        </div>
        <button className="sg-btn primary" onClick={() => { resetForm(); setShowForm(true); }} disabled={showForm && !editId}>
          + {tr('Новый контрагент', 'Yangi kontragent')}
        </button>
      </header>

      {/* Create / Edit form */}
      {showForm && (
        <article className="sg-card sg-grid" style={{ gap: 12 }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>
            {editId ? tr('Редактировать контрагента', 'Kontragentni tahrirlash') : tr('Новый контрагент', 'Yangi kontragent')}
          </h3>

          <div className="sg-grid cols-2" style={{ gap: 10 }}>
            <div style={{ gridColumn: '1 / -1' }}>
              <label className="sg-kpi-label" style={{ display: 'block', marginBottom: 4 }}>{tr('Название *', 'Nomi *')}</label>
              <input value={formName} onChange={(e) => setFormName(e.target.value)}
                style={{ width: '100%', border: '1px solid #d6e0da', borderRadius: 10, padding: '8px 11px', boxSizing: 'border-box' }}
                placeholder={tr('ООО «Поставщик»', 'Yetkazib beruvchi MChJ')} />
            </div>
            <div>
              <label className="sg-kpi-label" style={{ display: 'block', marginBottom: 4 }}>{tr('Контактное лицо', 'Aloqa shaxsi')}</label>
              <input value={formContact} onChange={(e) => setFormContact(e.target.value)}
                style={{ width: '100%', border: '1px solid #d6e0da', borderRadius: 10, padding: '8px 11px', boxSizing: 'border-box' }}
                placeholder={tr('Иван Иванов', 'Ivan Ivanov')} />
            </div>
            <div>
              <label className="sg-kpi-label" style={{ display: 'block', marginBottom: 4 }}>{tr('Телефон', 'Telefon')}</label>
              <input value={formPhone} onChange={(e) => setFormPhone(e.target.value)}
                style={{ width: '100%', border: '1px solid #d6e0da', borderRadius: 10, padding: '8px 11px', boxSizing: 'border-box' }}
                placeholder="+998 90 000 00 00" />
            </div>
            <div>
              <label className="sg-kpi-label" style={{ display: 'block', marginBottom: 4 }}>Email</label>
              <input type="email" value={formEmail} onChange={(e) => setFormEmail(e.target.value)}
                style={{ width: '100%', border: '1px solid #d6e0da', borderRadius: 10, padding: '8px 11px', boxSizing: 'border-box' }}
                placeholder="supplier@example.com" />
            </div>
            <div>
              <label className="sg-kpi-label" style={{ display: 'block', marginBottom: 4 }}>{tr('Адрес', 'Manzil')}</label>
              <input value={formAddress} onChange={(e) => setFormAddress(e.target.value)}
                style={{ width: '100%', border: '1px solid #d6e0da', borderRadius: 10, padding: '8px 11px', boxSizing: 'border-box' }}
                placeholder={tr('г. Ташкент, ул. ...', 'Toshkent sh., ...')} />
            </div>
            <div>
              <label className="sg-kpi-label" style={{ display: 'block', marginBottom: 4 }}>{tr('Заметка', 'Izoh')}</label>
              <input value={formNote} onChange={(e) => setFormNote(e.target.value)}
                style={{ width: '100%', border: '1px solid #d6e0da', borderRadius: 10, padding: '8px 11px', boxSizing: 'border-box' }} />
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button className="sg-btn ghost" onClick={resetForm} disabled={saving}>{tr('Отмена', 'Bekor')}</button>
            <button className="sg-btn primary" onClick={submitForm} disabled={saving}>
              {saving ? tr('Сохранение...', 'Saqlanmoqda...') : tr('Сохранить', 'Saqlash')}
            </button>
          </div>
        </article>
      )}

      {/* Suppliers list */}
      {suppliers.length === 0 && !showForm ? (
        <div className="sg-card" style={{ textAlign: 'center', padding: '40px 16px' }}>
          <p className="sg-subtitle">{tr('Контрагентов пока нет. Добавьте первого поставщика.', 'Hali kontragentlar yo\'q. Birinchi yetkazib beruvchini qo\'shing.')}</p>
        </div>
      ) : (
        suppliers.map((s: any) => (
          <article key={s.id} className="sg-card" style={{ padding: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontWeight: 800, fontSize: 15 }}>{s.name}</div>
                {(s.contactName || s.phone || s.email) && (
                  <p style={{ margin: '4px 0 0', fontSize: 13, color: '#5f6d64' }}>
                    {[s.contactName, s.phone, s.email].filter(Boolean).join(' · ')}
                  </p>
                )}
                {s.address && <p style={{ margin: '2px 0 0', fontSize: 12, color: '#748278' }}>{s.address}</p>}
                {s.note && <p style={{ margin: '2px 0 0', fontSize: 12, color: '#748278', fontStyle: 'italic' }}>{s.note}</p>}
                <p style={{ margin: '4px 0 0', fontSize: 11, color: '#9fb0a7' }}>
                  {tr('Добавлен', 'Qo\'shilgan')}: {new Date(s.createdAt).toLocaleDateString(locale)}
                </p>
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <button className="sg-btn ghost" style={{ fontSize: 12, padding: '5px 12px' }}
                  disabled={saving} onClick={() => openHistory(s)}>
                  {tr('История заказов', 'Buyurtmalar tarixi')}
                </button>
                <button className="sg-btn ghost" style={{ fontSize: 12, padding: '5px 12px' }}
                  disabled={saving} onClick={() => openEdit(s)}>
                  {tr('Изменить', 'Tahrirlash')}
                </button>
                <button className="sg-btn ghost" style={{ fontSize: 12, padding: '5px 12px', color: '#b91c1c' }}
                  disabled={saving} onClick={() => archive(s.id, s.name)}>
                  {tr('Архивировать', 'Arxivlashtirish')}
                </button>
              </div>
            </div>
          </article>
        ))
      )}

      {/* PO history panel */}
      {selectedSupplier && (
        <article className="sg-card" style={{ gap: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>
              {tr('История заказов', 'Buyurtmalar tarixi')}: {selectedSupplier.name}
            </h3>
            <button className="sg-btn ghost" style={{ fontSize: 12, padding: '4px 10px' }} onClick={() => setSelectedSupplier(null)}>✕</button>
          </div>

          {loadingPos ? (
            <div className="sg-skeleton" style={{ height: 80, borderRadius: 10 }} />
          ) : supplierPos.length === 0 ? (
            <p className="sg-subtitle">{tr('Заказов от этого поставщика пока нет', 'Bu yetkazib beruvchidan hali buyurtmalar yo\'q')}</p>
          ) : (
            <table className="sg-table">
              <thead>
                <tr>
                  <th>PO#</th>
                  <th>{tr('Дата', 'Sana')}</th>
                  <th>{tr('Статус', 'Holat')}</th>
                  <th>{tr('Сумма', 'Summa')}</th>
                  <th>{tr('Валюта', 'Valyuta')}</th>
                </tr>
              </thead>
              <tbody>
                {supplierPos.map((po: any) => (
                  <tr key={po.id}>
                    <td><strong>PO-{po.poNumber}</strong></td>
                    <td>{new Date(po.createdAt).toLocaleDateString(locale)}</td>
                    <td>
                      <span className="sg-badge" style={
                        po.status === 'RECEIVED'  ? { background: '#d1fae5', color: '#065f46' } :
                        po.status === 'CANCELLED' ? { background: '#fee2e2', color: '#991b1b' } :
                        po.status === 'ORDERED'   ? { background: '#dbeafe', color: '#1e40af' } :
                        po.status === 'IN_TRANSIT'? { background: '#fef9c3', color: '#854d0e' } :
                        { background: '#f3f4f6', color: '#4b5563' }
                      }>
                        {po.status === 'DRAFT'      ? tr('Черновик', 'Qoralama') :
                         po.status === 'ORDERED'    ? tr('Заказан', 'Buyurtma berildi') :
                         po.status === 'IN_TRANSIT' ? tr('В пути', "Yo'lda") :
                         po.status === 'RECEIVED'   ? tr('Получен', 'Qabul qilindi') :
                                                      tr('Отменён', 'Bekor qilindi')}
                      </span>
                    </td>
                    <td>{Number(po.totalCost).toLocaleString(locale)}</td>
                    <td>{po.currency}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </article>
      )}
    </section>
  );
}
