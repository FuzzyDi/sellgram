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
      alert(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function removeCategory(category: Category) {
    const count = category._count?.products || 0;
    const question =
      count > 0
        ? tr(
            `В категории "${category.name}" есть ${count} товар(ов). Товары останутся, но без категории. Удалить?`,
            `"${category.name}" toifasida ${count} ta mahsulot bor. Mahsulotlar qoladi, lekin toifasiz bo'ladi. O'chirilsinmi?`
          )
        : tr(`Удалить категорию "${category.name}"?`, `"${category.name}" toifasi o'chirilsinmi?`);

    if (!confirm(question)) return;

    try {
      await adminApi.deleteCategory(category.id);
      await load();
    } catch (err: any) {
      alert(err.message);
    }
  }

  return (
    <section className="sg-page sg-grid" style={{ gap: 16 }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
        <div>
          <h2 className="sg-title">{tr('Категории', 'Toifalar')}</h2>
          <p className="sg-subtitle">{tr('Группируйте товары для удобной навигации', 'Mahsulotlarni qulay navigatsiya uchun guruhlang')}</p>
        </div>
        <button onClick={openCreate} className="sg-btn primary" type="button">
          + {tr('Добавить', "Qo'shish")}
        </button>
      </header>

      <div className="sg-card" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={tr('Поиск по названию или slug', 'Nomi yoki slug bo\'yicha qidirish')}
          className="w-full"
          style={{ border: '1px solid #d6e0da', borderRadius: 10, padding: '10px 12px' }}
        />
      </div>

      {loading ? (
        <p className="sg-subtitle">{tr('Загрузка...', 'Yuklanmoqda...')}</p>
      ) : (
        <div className="sg-card" style={{ padding: 0, overflow: 'hidden' }}>
          <table className="sg-table">
            <thead>
              <tr>
                <th>{tr('Название', 'Nomi')}</th>
                <th>Slug</th>
                <th>{tr('Товаров', 'Mahsulotlar')}</th>
                <th>{tr('Статус', 'Holat')}</th>
                <th>{tr('Действия', 'Amallar')}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((category) => (
                <tr key={category.id}>
                  <td style={{ fontWeight: 700 }}>{category.name}</td>
                  <td>{category.slug}</td>
                  <td>{category._count?.products || 0}</td>
                  <td>
                    <span className="sg-badge" style={{ background: category.isActive ? '#e8f7ef' : '#eef1f0', color: category.isActive ? '#0b7f57' : '#5f6d64' }}>
                      {category.isActive ? tr('Активна', 'Faol') : tr('Скрыта', 'Yashirin')}
                    </span>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button className="sg-btn ghost" type="button" onClick={() => openEdit(category)}>
                        {tr('Изменить', 'Tahrirlash')}
                      </button>
                      <button className="sg-btn danger" type="button" onClick={() => void removeCategory(category)}>
                        {tr('Удалить', "O'chirish")}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={5} style={{ textAlign: 'center', color: '#6b7a71' }}>
                    {tr('Категорий пока нет', "Toifalar hozircha yo'q")}
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
              {editing ? tr('Редактировать категорию', 'Toifani tahrirlash') : tr('Новая категория', 'Yangi toifa')}
            </h3>
            <p className="sg-subtitle">{tr('Введите понятное название для покупателей', 'Mijozlar uchun tushunarli nom kiriting')}</p>

            <input value={name} onChange={(e) => setName(e.target.value)} autoFocus className="w-full" style={{ marginTop: 12, border: '1px solid #d6e0da', borderRadius: 10, padding: '10px 12px' }} placeholder={tr('Например: Напитки', 'Masalan: Ichimliklar')} />

            <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
              <button className="sg-btn primary" type="button" onClick={() => void saveCategory()} disabled={saving}>
                {saving ? tr('Сохранение...', 'Saqlanmoqda...') : tr('Сохранить', 'Saqlash')}
              </button>
              <button className="sg-btn ghost" type="button" onClick={() => setShowForm(false)}>
                {tr('Отмена', 'Bekor qilish')}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
