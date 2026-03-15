import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { adminApi } from '../api/store-admin-client';
import { useAdminI18n } from '../i18n';

interface Category {
  id: string;
  name: string;
  slug: string;
  sortOrder: number;
  isActive: boolean;
  _count?: { products: number };
}

export default function Categories() {
  const { tr } = useAdminI18n();
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Category | null>(null);
  const [name, setName] = useState('');
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: 'success' | 'error'; message: string } | null>(null);

  function showNotice(tone: 'success' | 'error', message: string) {
    setNotice({ tone, message });
    setTimeout(() => setNotice(null), 3200);
  }

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await adminApi.getCategories();
      setCategories(Array.isArray(data) ? data : data.items || []);
    } catch {
      setCategories([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return categories;
    return categories.filter((c) => c.name.toLowerCase().includes(q) || c.slug.toLowerCase().includes(q));
  }, [categories, search]);

  function openCreate() {
    setEditing(null);
    setName('');
    setShowForm(true);
  }

  function openEdit(category: Category) {
    setEditing(category);
    setName(category.name);
    setShowForm(true);
  }

  async function saveCategory() {
    const nextName = name.trim();
    if (!nextName) return;

    setSaving(true);
    try {
      if (editing) {
        await adminApi.updateCategory(editing.id, { name: nextName });
      } else {
        await adminApi.createCategory({ name: nextName });
      }
      setShowForm(false);
      setEditing(null);
      setName('');
      await load();
    } catch (err: any) {
      showNotice('error', err?.message || tr('\u041e\u0448\u0438\u0431\u043a\u0430 \u0441\u043e\u0445\u0440\u0430\u043d\u0435\u043d\u0438\u044f', 'Saqlashda xato'));
    } finally {
      setSaving(false);
    }
  }

  async function removeCategory(id: string) {
    setPendingDelete(null);
    try {
      await adminApi.deleteCategory(id);
      await load();
    } catch (err: any) {
      showNotice('error', err?.message || tr('\u041e\u0448\u0438\u0431\u043a\u0430', 'Xatolik'));
    }
  }

  const noticeNode = notice ? (
    <div style={{
      position: 'fixed', right: 16, top: 16, zIndex: 200, minWidth: 260, maxWidth: 420,
      borderRadius: 12, padding: '12px 16px', fontSize: 13, fontWeight: 700,
      boxShadow: '0 4px 16px rgba(0,0,0,0.1)', animation: 'sg-fade-in 0.2s ease both',
      color: notice.tone === 'error' ? '#991b1b' : '#065f46',
      background: notice.tone === 'error' ? '#fee2e2' : '#d1fae5',
      border: `1px solid ${notice.tone === 'error' ? '#fecaca' : '#a7f3d0'}`,
    }}>
      {notice.message}
    </div>
  ) : null;

  return (
    <section className="sg-page sg-grid" style={{ gap: 16 }}>
      {noticeNode}

      <header style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
        <div>
          <h2 className="sg-title">{tr('\u041a\u0430\u0442\u0435\u0433\u043e\u0440\u0438\u0438', 'Toifalar')}</h2>
          <p className="sg-subtitle">{tr('\u0413\u0440\u0443\u043f\u043f\u0438\u0440\u0443\u0439\u0442\u0435 \u0442\u043e\u0432\u0430\u0440\u044b \u0434\u043b\u044f \u0443\u0434\u043e\u0431\u043d\u043e\u0439 \u043d\u0430\u0432\u0438\u0433\u0430\u0446\u0438\u0438', 'Mahsulotlarni qulay navigatsiya uchun guruhlang')}</p>
        </div>
        <button onClick={openCreate} className="sg-btn primary" type="button">
          + {tr('\u0414\u043e\u0431\u0430\u0432\u0438\u0442\u044c', "Qo'shish")}
        </button>
      </header>

      <div className="sg-card" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={tr('\u041f\u043e\u0438\u0441\u043a \u043f\u043e \u043d\u0430\u0437\u0432\u0430\u043d\u0438\u044e \u0438\u043b\u0438 slug', "Nomi yoki slug bo'yicha qidirish")}
          className="w-full"
          style={{ border: '1px solid #d6e0da', borderRadius: 10, padding: '10px 12px', flex: 1 }}
        />
      </div>

      {loading ? (
        <div className="sg-card" style={{ padding: 0, overflow: 'hidden' }}>
          {[1, 2, 3].map((i) => (
            <div key={i} style={{ display: 'flex', gap: 16, padding: '12px 16px', borderBottom: '1px solid #edf2ee', alignItems: 'center' }}>
              <div className="sg-skeleton" style={{ height: 16, flex: 2 }} />
              <div className="sg-skeleton" style={{ height: 14, flex: 2 }} />
              <div className="sg-skeleton" style={{ height: 14, width: 30 }} />
              <div className="sg-skeleton" style={{ height: 22, width: 60, borderRadius: 999 }} />
              <div className="sg-skeleton" style={{ height: 32, width: 100, borderRadius: 8 }} />
            </div>
          ))}
        </div>
      ) : (
        <div className="sg-card" style={{ padding: 0, overflow: 'hidden' }}>
          <table className="sg-table">
            <thead>
              <tr>
                <th>{tr('\u041d\u0430\u0437\u0432\u0430\u043d\u0438\u0435', 'Nomi')}</th>
                <th>Slug</th>
                <th>{tr('\u0422\u043e\u0432\u0430\u0440\u043e\u0432', 'Mahsulotlar')}</th>
                <th>{tr('\u0421\u0442\u0430\u0442\u0443\u0441', 'Holat')}</th>
                <th>{tr('\u0414\u0435\u0439\u0441\u0442\u0432\u0438\u044f', 'Amallar')}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((category) => {
                const productCount = category._count?.products || 0;
                const isConfirming = pendingDelete === category.id;
                return (
                  <React.Fragment key={category.id}>
                    <tr>
                      <td style={{ fontWeight: 700 }}>{category.name}</td>
                      <td style={{ color: '#64756b', fontSize: 13 }}>{category.slug}</td>
                      <td>{productCount}</td>
                      <td>
                        <span className="sg-badge" style={category.isActive
                          ? { background: '#d1fae5', color: '#065f46' }
                          : { background: '#f3f4f6', color: '#4b5563' }}>
                          {category.isActive ? tr('\u0410\u043a\u0442\u0438\u0432\u043d\u0430', 'Faol') : tr('\u0421\u043a\u0440\u044b\u0442\u0430', 'Yashirin')}
                        </span>
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button className="sg-btn ghost" type="button" onClick={() => openEdit(category)}>
                            {tr('\u0418\u0437\u043c\u0435\u043d\u0438\u0442\u044c', 'Tahrirlash')}
                          </button>
                          <button
                            className="sg-btn danger"
                            type="button"
                            onClick={() => setPendingDelete(isConfirming ? null : category.id)}
                          >
                            {tr('\u0423\u0434\u0430\u043b\u0438\u0442\u044c', "O'chirish")}
                          </button>
                        </div>
                      </td>
                    </tr>
                    {isConfirming && (
                      <tr>
                        <td colSpan={5} style={{ background: '#fff8f0', padding: '10px 16px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                            <span style={{ fontSize: 13, color: '#92400e', fontWeight: 600 }}>
                              {productCount > 0
                                ? tr(
                                    `\u0412 \u043a\u0430\u0442\u0435\u0433\u043e\u0440\u0438\u0438 ${productCount} \u0442\u043e\u0432\u0430\u0440(\u043e\u0432) \u2014 \u043e\u043d\u0438 \u043e\u0441\u0442\u0430\u043d\u0443\u0442\u0441\u044f \u0431\u0435\u0437 \u043a\u0430\u0442\u0435\u0433\u043e\u0440\u0438\u0438. \u0423\u0434\u0430\u043b\u0438\u0442\u044c?`,
                                    `Toifada ${productCount} ta mahsulot bor \u2014 ular toifasiz qoladi. O\u2019chirilsinmi?`
                                  )
                                : tr('\u0423\u0434\u0430\u043b\u0438\u0442\u044c \u043a\u0430\u0442\u0435\u0433\u043e\u0440\u0438\u044e?', "Toifani o'chirishni tasdiqlaysizmi?")}
                            </span>
                            <button
                              className="sg-btn danger"
                              type="button"
                              style={{ padding: '4px 12px', fontSize: 12 }}
                              onClick={() => void removeCategory(category.id)}
                            >
                              {tr('\u0414\u0430, \u0443\u0434\u0430\u043b\u0438\u0442\u044c', "Ha, o'chirish")}
                            </button>
                            <button
                              className="sg-btn ghost"
                              type="button"
                              style={{ padding: '4px 12px', fontSize: 12 }}
                              onClick={() => setPendingDelete(null)}
                            >
                              {tr('\u041e\u0442\u043c\u0435\u043d\u0430', 'Bekor qilish')}
                            </button>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={5} style={{ textAlign: 'center', color: '#6b7a71', padding: '20px' }}>
                    {tr('\u041a\u0430\u0442\u0435\u0433\u043e\u0440\u0438\u0439 \u043f\u043e\u043a\u0430 \u043d\u0435\u0442', "Toifalar hozircha yo'q")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 bg-black/45 flex items-center justify-center z-50 p-4">
          <div className="sg-card" style={{ width: '100%', maxWidth: 460 }}>
            <h3 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>
              {editing ? tr('\u0420\u0435\u0434\u0430\u043a\u0442\u0438\u0440\u043e\u0432\u0430\u0442\u044c \u043a\u0430\u0442\u0435\u0433\u043e\u0440\u0438\u044e', 'Toifani tahrirlash') : tr('\u041d\u043e\u0432\u0430\u044f \u043a\u0430\u0442\u0435\u0433\u043e\u0440\u0438\u044f', 'Yangi toifa')}
            </h3>
            <p className="sg-subtitle">{tr('\u0412\u0432\u0435\u0434\u0438\u0442\u0435 \u043f\u043e\u043d\u044f\u0442\u043d\u043e\u0435 \u043d\u0430\u0437\u0432\u0430\u043d\u0438\u0435 \u0434\u043b\u044f \u043f\u043e\u043a\u0443\u043f\u0430\u0442\u0435\u043b\u0435\u0439', 'Mijozlar uchun tushunarli nom kiriting')}</p>

            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              onKeyDown={(e) => e.key === 'Enter' && void saveCategory()}
              className="w-full"
              style={{ marginTop: 12, border: '1px solid #d6e0da', borderRadius: 10, padding: '10px 12px' }}
              placeholder={tr('\u041d\u0430\u043f\u0440\u0438\u043c\u0435\u0440: \u041d\u0430\u043f\u0438\u0442\u043a\u0438', 'Masalan: Ichimliklar')}
            />

            <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
              <button className="sg-btn primary" type="button" onClick={() => void saveCategory()} disabled={saving || !name.trim()}>
                {saving ? tr('\u0421\u043e\u0445\u0440\u0430\u043d\u0435\u043d\u0438\u0435...', 'Saqlanmoqda...') : tr('\u0421\u043e\u0445\u0440\u0430\u043d\u0438\u0442\u044c', 'Saqlash')}
              </button>
              <button className="sg-btn ghost" type="button" onClick={() => setShowForm(false)}>
                {tr('\u041e\u0442\u043c\u0435\u043d\u0430', 'Bekor qilish')}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
