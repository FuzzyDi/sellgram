import React, { useCallback, useEffect, useRef, useState } from 'react';
import { adminApi, toImageUrl } from '../api/store-admin-client';
import { useAdminI18n } from '../i18n';

interface Banner {
  id: string;
  title?: string;
  imageUrl: string;
  linkUrl?: string;
  sortOrder: number;
  isActive: boolean;
}

export default function Banners() {
  const { tr } = useAdminI18n();
  const [banners, setBanners] = useState<Banner[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [notice, setNotice] = useState<{ tone: 'success' | 'error'; message: string } | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ title: '', linkUrl: '', sortOrder: '0' });
  const [saving, setSaving] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [newTitle, setNewTitle] = useState('');
  const [newLink, setNewLink] = useState('');
  const [newOrder, setNewOrder] = useState('0');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await adminApi.getBanners();
      setBanners(Array.isArray(data) ? data : data.items || []);
    } catch {
      showNotice('error', tr('Не удалось загрузить баннеры', 'Bannerlarni yuklab bo\'lmadi'));
    } finally {
      setLoading(false);
    }
  }, [tr]);

  useEffect(() => { void load(); }, [load]);

  function showNotice(tone: 'success' | 'error', message: string) {
    setNotice({ tone, message });
    setTimeout(() => setNotice(null), 3200);
  }

  const handleUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      await adminApi.uploadBanner(file, {
        title: newTitle.trim() || undefined,
        linkUrl: newLink.trim() || undefined,
        sortOrder: parseInt(newOrder, 10) || 0,
      });
      setNewTitle('');
      setNewLink('');
      setNewOrder('0');
      showNotice('success', tr('Баннер добавлен', 'Banner qo\'shildi'));
      await load();
    } catch (err: any) {
      showNotice('error', err.message || tr('Ошибка загрузки', 'Yuklash xatosi'));
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }, [newTitle, newLink, newOrder, load, tr]);

  const openEdit = (banner: Banner) => {
    setEditingId(banner.id);
    setEditForm({ title: banner.title || '', linkUrl: banner.linkUrl || '', sortOrder: String(banner.sortOrder) });
  };

  const saveEdit = async () => {
    if (!editingId) return;
    setSaving(true);
    try {
      await adminApi.updateBanner(editingId, {
        title: editForm.title.trim() || undefined,
        linkUrl: editForm.linkUrl.trim() || undefined,
        sortOrder: parseInt(editForm.sortOrder, 10) || 0,
      });
      setEditingId(null);
      showNotice('success', tr('Сохранено', 'Saqlandi'));
      await load();
    } catch (err: any) {
      showNotice('error', err.message || tr('Ошибка', 'Xatolik'));
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (banner: Banner) => {
    try {
      await adminApi.updateBanner(banner.id, { isActive: !banner.isActive });
      await load();
    } catch (err: any) {
      showNotice('error', err.message || tr('Ошибка', 'Xatolik'));
    }
  };

  const deleteBanner = async (id: string) => {
    setPendingDelete(null);
    try {
      await adminApi.deleteBanner(id);
      showNotice('success', tr('Удалено', 'O\'chirildi'));
      await load();
    } catch (err: any) {
      showNotice('error', err.message || tr('Ошибка', 'Xatolik'));
    }
  };

  return (
    <section className="sg-page sg-grid" style={{ gap: 16 }}>
      {notice && (
        <div style={{
          position: 'fixed', top: 18, right: 18, zIndex: 70, minWidth: 280, maxWidth: 440,
          borderRadius: 12, padding: '12px 14px', fontSize: 14, fontWeight: 700,
          boxShadow: '0 12px 28px rgba(0,0,0,0.12)',
          color: notice.tone === 'error' ? '#991b1b' : '#065f46',
          background: notice.tone === 'error' ? '#fee2e2' : '#d1fae5',
          border: `1px solid ${notice.tone === 'error' ? '#fecaca' : '#a7f3d0'}`,
        }}>
          {notice.message}
        </div>
      )}

      <header>
        <h2 className="sg-title">{tr('Баннеры', 'Bannerlar')}</h2>
        <p className="sg-subtitle">{tr('Рекламные баннеры на витрине магазина', 'Do\'kon vitrinasidagi reklama bannerlari')}</p>
      </header>

      <div className="sg-card sg-grid" style={{ gap: 12 }}>
        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>{tr('Добавить баннер', 'Banner qo\'shish')}</h3>
        <div className="sg-grid cols-2" style={{ gap: 10 }}>
          <div>
            <label style={{ display: 'block', fontSize: 13, marginBottom: 4 }}>{tr('Заголовок (необязательно)', 'Sarlavha (ixtiyoriy)')}</label>
            <input
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder={tr('Летняя акция', 'Yozgi aksiya')}
              style={{ border: '1px solid #d6e0da', borderRadius: 10, padding: '9px 11px', width: '100%', boxSizing: 'border-box' }}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 13, marginBottom: 4 }}>{tr('Ссылка (необязательно)', 'Havola (ixtiyoriy)')}</label>
            <input
              value={newLink}
              onChange={(e) => setNewLink(e.target.value)}
              placeholder="https://..."
              style={{ border: '1px solid #d6e0da', borderRadius: 10, padding: '9px 11px', width: '100%', boxSizing: 'border-box' }}
            />
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
          <div>
            <label style={{ display: 'block', fontSize: 13, marginBottom: 4 }}>{tr('Порядок', 'Tartib')}</label>
            <input
              type="number"
              value={newOrder}
              onChange={(e) => setNewOrder(e.target.value)}
              min={0}
              style={{ border: '1px solid #d6e0da', borderRadius: 10, padding: '9px 11px', width: 80 }}
            />
          </div>
          <label style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            padding: '9px 16px', borderRadius: 10,
            background: uploading ? '#e5e7eb' : '#00875a', color: '#fff',
            fontWeight: 700, fontSize: 14, cursor: uploading ? 'not-allowed' : 'pointer',
          }}>
            {uploading ? tr('Загрузка...', 'Yuklanmoqda...') : `+ ${tr('Загрузить изображение', 'Rasm yuklash')}`}
            <input ref={fileInputRef} type="file" accept="image/*" onChange={handleUpload} style={{ display: 'none' }} disabled={uploading} />
          </label>
        </div>
      </div>

      {loading ? (
        <div className="sg-grid cols-2">
          {[1, 2, 3].map((i) => <div key={i} className="sg-skeleton" style={{ height: 180, borderRadius: 12 }} />)}
        </div>
      ) : banners.length === 0 ? (
        <div className="sg-card" style={{ textAlign: 'center', padding: '40px 16px', color: '#748278' }}>
          {tr('Баннеров нет. Загрузите первый баннер.', 'Bannerlar yo\'q. Birinchi bannerni yuklang.')}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
          {banners.map((banner) => (
            <div key={banner.id} className="sg-card" style={{ padding: 0, overflow: 'hidden', opacity: banner.isActive ? 1 : 0.55 }}>
              <div style={{ position: 'relative', aspectRatio: '16/6', background: '#eef3f0' }}>
                <img
                  src={toImageUrl(banner.imageUrl)}
                  alt={banner.title || 'banner'}
                  style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                />
                <span
                  className="sg-badge"
                  style={{
                    position: 'absolute', top: 8, right: 8,
                    background: banner.isActive ? '#d1fae5' : '#f3f4f6',
                    color: banner.isActive ? '#065f46' : '#4b5563',
                  }}
                >
                  {banner.isActive ? tr('Активен', 'Faol') : tr('Скрыт', 'Yashirin')}
                </span>
              </div>

              {editingId === banner.id ? (
                <div style={{ padding: '12px 14px', display: 'grid', gap: 8 }}>
                  <input
                    value={editForm.title}
                    onChange={(e) => setEditForm((f) => ({ ...f, title: e.target.value }))}
                    placeholder={tr('Заголовок', 'Sarlavha')}
                    style={{ border: '1px solid #d6e0da', borderRadius: 8, padding: '7px 10px', fontSize: 13, width: '100%', boxSizing: 'border-box' }}
                  />
                  <input
                    value={editForm.linkUrl}
                    onChange={(e) => setEditForm((f) => ({ ...f, linkUrl: e.target.value }))}
                    placeholder="https://..."
                    style={{ border: '1px solid #d6e0da', borderRadius: 8, padding: '7px 10px', fontSize: 13, width: '100%', boxSizing: 'border-box' }}
                  />
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <label style={{ fontSize: 12, color: '#748278' }}>{tr('Порядок', 'Tartib')}:</label>
                    <input
                      type="number"
                      value={editForm.sortOrder}
                      onChange={(e) => setEditForm((f) => ({ ...f, sortOrder: e.target.value }))}
                      style={{ border: '1px solid #d6e0da', borderRadius: 8, padding: '5px 8px', fontSize: 13, width: 60 }}
                    />
                    <button className="sg-btn primary" style={{ marginLeft: 'auto', padding: '5px 14px', fontSize: 13 }} disabled={saving} onClick={saveEdit}>
                      {saving ? '...' : tr('Сохранить', 'Saqlash')}
                    </button>
                    <button className="sg-btn ghost" style={{ padding: '5px 10px', fontSize: 13 }} onClick={() => setEditingId(null)}>
                      {tr('Отмена', 'Bekor')}
                    </button>
                  </div>
                </div>
              ) : (
                <div style={{ padding: '10px 14px' }}>
                  {banner.title && <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 2 }}>{banner.title}</div>}
                  {banner.linkUrl && <div style={{ fontSize: 12, color: '#748278', marginBottom: 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{banner.linkUrl}</div>}
                  <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                    <button className="sg-btn ghost" style={{ fontSize: 12, padding: '4px 10px' }} onClick={() => openEdit(banner)}>
                      {tr('Изменить', 'Tahrirlash')}
                    </button>
                    <button
                      className="sg-btn ghost"
                      style={{ fontSize: 12, padding: '4px 10px' }}
                      onClick={() => toggleActive(banner)}
                    >
                      {banner.isActive ? tr('Скрыть', 'Yashirish') : tr('Показать', 'Ko\'rsatish')}
                    </button>
                    {pendingDelete === banner.id ? (
                      <>
                        <button className="sg-btn danger" style={{ fontSize: 12, padding: '4px 10px' }} onClick={() => deleteBanner(banner.id)}>
                          {tr('Да', 'Ha')}
                        </button>
                        <button className="sg-btn ghost" style={{ fontSize: 12, padding: '4px 10px' }} onClick={() => setPendingDelete(null)}>
                          {tr('Нет', 'Yo\'q')}
                        </button>
                      </>
                    ) : (
                      <button className="sg-btn danger" style={{ fontSize: 12, padding: '4px 10px', marginLeft: 'auto' }} onClick={() => setPendingDelete(banner.id)}>
                        {tr('Удалить', 'O\'chirish')}
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
