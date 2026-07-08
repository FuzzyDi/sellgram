import { useCallback, useEffect, useState } from 'react';
import { adminApi } from '../../api/store-admin-client';
import { useAdminI18n } from '../../i18n';
import type { Category, NoticeTone, Product } from './types';

// Product list state: filters, pagination, selection, bulk actions.
// Independent from the create/edit form's own state (useProductForm).
export function useProducts(showNotice: (tone: NoticeTone, message: string) => void) {
  const { tr } = useAdminI18n();
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [activeFilter, setActiveFilter] = useState<'all' | 'active' | 'hidden'>('all');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulking, setBulking] = useState(false);

  const loadProducts = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('pageSize', '20');
      if (search.trim()) params.set('search', search.trim());
      if (selectedCategory) params.set('categoryId', selectedCategory);
      if (activeFilter === 'active') params.set('active', 'true');
      if (activeFilter === 'hidden') params.set('active', 'false');

      const data = await adminApi.getProducts(params.toString());
      setProducts(data.items || []);
      setTotal(data.total || 0);
      setTotalPages(data.totalPages || 1);
      setSelected(new Set());
    } catch {
      setLoadError(true);
      setProducts([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [search, selectedCategory, activeFilter, page]);

  const loadCategories = useCallback(async () => {
    try {
      const data = await adminApi.getCategories();
      setCategories(Array.isArray(data) ? data : data.items || []);
    } catch {
      setCategories([]);
    }
  }, []);

  useEffect(() => {
    void loadProducts();
  }, [loadProducts]);

  useEffect(() => {
    void loadCategories();
  }, [loadCategories]);

  const handleBulkAction = useCallback(
    async (action: 'activate' | 'deactivate') => {
      const ids = Array.from(selected);
      if (ids.length === 0) return;
      setBulking(true);
      try {
        await adminApi.bulkUpdateProducts({ ids, action });
        showNotice('success', tr(`Обновлено: ${ids.length}`, `Yangilandi: ${ids.length}`));
        await loadProducts();
      } catch (err: any) {
        showNotice('error', err?.message || tr('Ошибка', 'Xatolik'));
      } finally {
        setBulking(false);
      }
    },
    [selected, loadProducts, tr, showNotice]
  );

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selected.size === products.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(products.map((p) => p.id)));
    }
  };

  return {
    products, categories, total, loading, loadError,
    search, setSearch, selectedCategory, setSelectedCategory, activeFilter, setActiveFilter,
    page, setPage, totalPages, selected, setSelected, bulking,
    loadProducts, loadCategories, handleBulkAction, toggleSelect, toggleSelectAll,
  };
}
