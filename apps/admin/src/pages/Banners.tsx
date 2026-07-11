import React, { useCallback, useEffect, useRef, useState } from 'react';
import { adminApi, toImageUrl } from '../api/store-admin-client';
import { useAdminI18n } from '../i18n';
import Card from '../components/Card';
import Button from '../components/Button';
import Input from '../components/Input';
import Badge from '../components/Badge';

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
      showNotice('error', tr('Не удалось загрузить баннеры', "Bannerlarni yuklab bo'lmadi"));
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
      showNotice('success', tr('Баннер добавлен', "Banner qo'shildi"));
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
      showNotice('success', tr('Удалено', "O'chirildi"));
      await load();
    } catch (err: any) {
      showNotice('error', err.message || tr('Ошибка', 'Xatolik'));
    }
  };

  const noticeNode = notice ? (
    <div
      className={[
        'fixed top-[18px] right-[18px] z-[70] min-w-[280px] max-w-[440px] rounded-token-lg px-3.5 py-3 text-token-sm font-semibold shadow-sm border',
        notice.tone === 'error' ? 'bg-danger/10 text-danger border-danger/30' : 'bg-success/10 text-success border-success/30',
      ].join(' ')}
      role="status"
      aria-live="polite"
    >
      {notice.message}
    </div>
  ) : null;

  return (
    <section className="flex flex-col gap-4">
      {noticeNode}
      <header>
        <h2 className="text-token-2xl font-semibold text-neutral-800">{tr('Баннеры', 'Bannerlar')}</h2>
        <p className="mt-1 text-token-sm text-neutral-500">{tr('Рекламные баннеры на витрине магазина', "Do'kon vitrinasidagi reklama bannerlari")}</p>
      </header>

      <Card className="flex flex-col gap-3">
        <h3 className="m-0 text-token-base font-semibold text-neutral-800">{tr('Добавить баннер', "Banner qo'shish")}</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Input
            label={tr('Заголовок (необязательно)', 'Sarlavha (ixtiyoriy)')}
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder={tr('Летняя акция', 'Yozgi aksiya')}
          />
          <Input
            label={tr('Ссылка (необязательно)', 'Havola (ixtiyoriy)')}
            value={newLink}
            onChange={(e) => setNewLink(e.target.value)}
            placeholder="https://..."
          />
        </div>
        <div className="flex gap-3 items-end flex-wrap">
          <div className="w-[100px]">
            <Input
              type="number"
              label={tr('Порядок', 'Tartib')}
              value={newOrder}
              onChange={(e) => setNewOrder(e.target.value)}
              min={0}
            />
          </div>
          <label
            className={[
              'inline-flex items-center gap-2 rounded-token-md px-4 py-2 text-token-sm font-semibold text-white',
              uploading ? 'bg-neutral-300 cursor-not-allowed' : 'bg-accent-600 hover:bg-accent-500 cursor-pointer',
            ].join(' ')}
          >
            {uploading ? tr('Загрузка...', 'Yuklanmoqda...') : `+ ${tr('Загрузить изображение', 'Rasm yuklash')}`}
            <input ref={fileInputRef} type="file" accept="image/*" onChange={handleUpload} className="hidden" disabled={uploading} />
          </label>
        </div>
      </Card>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          {[1, 2, 3].map((i) => <div key={i} className="h-[180px] rounded-token-lg bg-neutral-100 animate-pulse" />)}
        </div>
      ) : banners.length === 0 ? (
        <Card className="text-center py-10 px-4">
          <p className="m-0 text-token-sm text-neutral-500">{tr('Баннеров нет. Загрузите первый баннер.', "Bannerlar yo'q. Birinchi bannerni yuklang.")}</p>
        </Card>
      ) : (
        <div className="grid gap-3.5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}>
          {banners.map((banner) => (
            <Card key={banner.id} className={`overflow-hidden p-0 ${banner.isActive ? '' : 'opacity-55'}`}>
              <div className="relative bg-neutral-100" style={{ aspectRatio: '16/6' }}>
                <img
                  src={toImageUrl(banner.imageUrl)}
                  alt={banner.title || 'banner'}
                  className="w-full h-full object-cover block"
                />
                <Badge variant={banner.isActive ? 'success' : 'neutral'} className="absolute top-2 right-2">
                  {banner.isActive ? tr('Активен', 'Faol') : tr('Скрыт', 'Yashirin')}
                </Badge>
              </div>

              {editingId === banner.id ? (
                <div className="p-3.5 flex flex-col gap-2">
                  <Input
                    value={editForm.title}
                    onChange={(e) => setEditForm((f) => ({ ...f, title: e.target.value }))}
                    placeholder={tr('Заголовок', 'Sarlavha')}
                  />
                  <Input
                    value={editForm.linkUrl}
                    onChange={(e) => setEditForm((f) => ({ ...f, linkUrl: e.target.value }))}
                    placeholder="https://..."
                  />
                  <div className="flex gap-2 items-center">
                    <label className="text-token-xs text-neutral-500">{tr('Порядок', 'Tartib')}:</label>
                    <div className="w-[70px]">
                      <Input
                        type="number"
                        value={editForm.sortOrder}
                        onChange={(e) => setEditForm((f) => ({ ...f, sortOrder: e.target.value }))}
                      />
                    </div>
                    <Button variant="primary" size="sm" type="button" className="ml-auto" disabled={saving} onClick={saveEdit}>
                      {saving ? '...' : tr('Сохранить', 'Saqlash')}
                    </Button>
                    <Button variant="ghost" size="sm" type="button" onClick={() => setEditingId(null)}>
                      {tr('Отмена', 'Bekor')}
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="p-3.5">
                  {banner.title && <div className="font-semibold text-token-sm text-neutral-800 mb-0.5">{banner.title}</div>}
                  {banner.linkUrl && (
                    <div className="text-token-xs text-neutral-500 mb-1.5 overflow-hidden text-ellipsis whitespace-nowrap">{banner.linkUrl}</div>
                  )}
                  <div className="flex gap-1.5 mt-2">
                    <Button variant="ghost" size="sm" type="button" onClick={() => openEdit(banner)}>
                      {tr('Изменить', 'Tahrirlash')}
                    </Button>
                    <Button variant="ghost" size="sm" type="button" onClick={() => toggleActive(banner)}>
                      {banner.isActive ? tr('Скрыть', 'Yashirish') : tr('Показать', "Ko'rsatish")}
                    </Button>
                    {pendingDelete === banner.id ? (
                      <>
                        <Button variant="danger" size="sm" type="button" onClick={() => deleteBanner(banner.id)}>
                          {tr('Да', 'Ha')}
                        </Button>
                        <Button variant="ghost" size="sm" type="button" onClick={() => setPendingDelete(null)}>
                          {tr('Нет', "Yo'q")}
                        </Button>
                      </>
                    ) : (
                      <Button variant="danger" size="sm" type="button" className="ml-auto" onClick={() => setPendingDelete(banner.id)}>
                        {tr('Удалить', "O'chirish")}
                      </Button>
                    )}
                  </div>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </section>
  );
}
