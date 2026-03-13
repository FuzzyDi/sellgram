import React, { useEffect, useState, useCallback } from 'react';
import { adminApi } from '../api/store-admin-client';
import Button from '../components/Button';
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
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await adminApi.getCategories();
      setCategories(Array.isArray(data) ? data : data.items || []);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const openCreate = () => { setEditingId(null); setName(''); setShowForm(true); };
  const openEdit = (c: Category) => { setEditingId(c.id); setName(c.name); setShowForm(true); };

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      if (editingId) {
        await adminApi.updateCategory(editingId, { name: name.trim() });
      } else {
        await adminApi.createCategory({ name: name.trim() });
      }
      setShowForm(false);
      setName('');
      load();
    } catch (err: any) {
      alert(err.message);
    }
    setSaving(false);
  };

  const handleDelete = async (c: Category) => {
    const count = c._count?.products || 0;
    const msg = count > 0
      ? tr(
          `В категории "${c.name}" ${count} товар(ов). Товары останутся, но без категории. Удалить?`,
          `"${c.name}" toifasida ${count} ta mahsulot bor. Mahsulotlar qoladi, lekin toifasiz bo'ladi. O'chirilsinmi?`
        )
      : tr(`Удалить категорию "${c.name}"?`, `"${c.name}" toifasini o'chirilsinmi?`);

    if (!confirm(msg)) return;

    try {
      await adminApi.deleteCategory(c.id);
      load();
    } catch (err: any) {
      alert(err.message);
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h2 className="text-2xl font-bold">📁 {tr('Категории', 'Toifalar')}</h2>
        <Button onClick={openCreate} className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700">
          + {tr('Категория', 'Toifa')}
        </Button>
      </div>

      {loading ? <p className="text-gray-400">{tr('Загрузка...', 'Yuklanmoqda...')}</p> : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-gray-500 border-b bg-gray-50">
              <th className="px-4 py-3">{tr('Название', 'Nomi')}</th>
              <th className="px-4 py-3">{tr('Товаров', 'Mahsulotlar')}</th>
              <th className="px-4 py-3 w-32">{tr('Действия', 'Amallar')}</th>
            </tr></thead>
            <tbody>
              {categories.map(c => (
                <tr key={c.id} className="border-b last:border-0 hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <span className="font-medium">{c.name}</span>
                    {!c.isActive && <span className="ml-2 text-xs text-red-500">({tr('скрыта', 'yashirin')})</span>}
                  </td>
                  <td className="px-4 py-3 text-gray-500">{c._count?.products || 0}</td>
                  <td className="px-4 py-3">
                    <div style={{ display: 'flex', gap: 4 }}>
                      <Button onClick={() => openEdit(c)} className="px-2 py-1 text-xs bg-blue-50 text-blue-600 rounded hover:bg-blue-100">✏️</Button>
                      <Button onClick={() => handleDelete(c)} className="px-2 py-1 text-xs bg-red-50 text-red-600 rounded hover:bg-red-100">🗑️</Button>
                    </div>
                  </td>
                </tr>
              ))}
              {categories.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-4 py-8 text-center text-gray-400">{tr('Нет категорий', "Toifalar yo'q")}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6">
            <h3 className="font-bold mb-4">{editingId ? tr('Переименовать', 'Nomini o\'zgartirish') : tr('Новая категория', 'Yangi toifa')}</h3>
            <form onSubmit={e => { e.preventDefault(); handleSave(); }}>
              <input
                value={name}
                onChange={e => setName(e.target.value)}
                autoFocus
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm mb-4"
                placeholder={tr('Название категории', 'Toifa nomi')}
              />
              <div style={{ display: 'flex', gap: 12 }}>
                <button type="submit" disabled={saving} className="flex-1 bg-blue-600 text-white py-2 rounded-lg disabled:opacity-50">
                  {saving ? '...' : editingId ? tr('Сохранить', 'Saqlash') : tr('Создать', 'Yaratish')}
                </button>
                <Button onClick={() => setShowForm(false)} className="px-6 py-2 bg-gray-100 rounded-lg">{tr('Отмена', 'Bekor qilish')}</Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
