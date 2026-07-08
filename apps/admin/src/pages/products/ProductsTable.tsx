import React from 'react';
import { toImageUrl } from '../../api/store-admin-client';
import { useAdminI18n } from '../../i18n';
import Card from '../../components/Card';
import Button from '../../components/Button';
import Badge from '../../components/Badge';
import Table, { type TableColumn } from '../../components/Table';
import type { Product } from './types';

interface ProductsTableProps {
  products: Product[];
  loading: boolean;
  loadError: boolean;
  onRetry: () => void;
  selected: Set<string>;
  onToggleSelect: (id: string) => void;
  onToggleSelectAll: () => void;
  pendingDelete: string | null;
  onRequestDelete: (id: string) => void;
  onCancelDelete: () => void;
  onConfirmDelete: (id: string) => void;
  onEdit: (product: Product) => void;
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

export default function ProductsTable({
  products, loading, loadError, onRetry, selected, onToggleSelect, onToggleSelectAll,
  pendingDelete, onRequestDelete, onCancelDelete, onConfirmDelete, onEdit, page, totalPages, onPageChange,
}: ProductsTableProps) {
  const { tr } = useAdminI18n();

  if (loadError) {
    return (
      <Card className="text-center py-8 px-4">
        <p className="m-0 font-semibold text-danger">{tr('Не удалось загрузить товары', "Mahsulotlarni yuklab bo'lmadi")}</p>
        <Button variant="ghost" size="md" type="button" className="mt-3.5" onClick={onRetry}>
          {tr('Повторить', 'Qayta urinish')}
        </Button>
      </Card>
    );
  }

  const columns: TableColumn<Product>[] = [
    {
      key: 'select',
      header: (
        <input
          type="checkbox"
          className="h-4 w-4 accent-accent-600"
          checked={products.length > 0 && selected.size === products.length}
          onChange={onToggleSelectAll}
        />
      ),
      width: 36,
      render: (product) => (
        <input
          type="checkbox"
          className="h-4 w-4 accent-accent-600"
          checked={selected.has(product.id)}
          onChange={() => onToggleSelect(product.id)}
        />
      ),
    },
    {
      key: 'photo',
      header: tr('Фото', 'Rasm'),
      width: 58,
      render: (product) => (
        <div className="w-10 h-10 rounded-token-sm bg-neutral-100 flex items-center justify-center overflow-hidden">
          {product.images?.[0]?.url ? (
            <img src={toImageUrl(product.images[0].url)} alt="product" className="w-full h-full object-cover" />
          ) : (
            <span className="text-neutral-400">-</span>
          )}
        </div>
      ),
    },
    {
      key: 'name',
      header: tr('Товар', 'Mahsulot'),
      render: (product) => (
        <div>
          <div className="font-semibold text-neutral-800">{product.name}</div>
          {product.description && <div className="text-token-xs text-neutral-500">{product.description}</div>}
          {product.sku && <div className="text-token-xs text-neutral-400">{product.sku}</div>}
        </div>
      ),
    },
    {
      key: 'category',
      header: tr('Категория', 'Toifa'),
      render: (product) => product.category?.name || '-',
    },
    {
      key: 'price',
      header: tr('Цена', 'Narx'),
      render: (product) => <span className="font-semibold text-neutral-800">{Number(product.price).toLocaleString()} UZS</span>,
    },
    {
      key: 'stock',
      header: tr('Склад', 'Ombor'),
      render: (product) => (
        <span className={`font-semibold ${product.stockQty <= product.lowStockAlert ? 'text-danger' : 'text-neutral-700'}`}>
          {product.stockQty} {tr('шт', 'dona')}
        </span>
      ),
    },
    {
      key: 'status',
      header: tr('Статус', 'Holat'),
      render: (product) => (
        <Badge variant={product.isActive ? 'success' : 'neutral'}>
          {product.isActive ? tr('Активен', 'Faol') : tr('Скрыт', 'Yashirin')}
        </Badge>
      ),
    },
    {
      key: 'actions',
      header: tr('Действия', 'Amallar'),
      render: (product) =>
        pendingDelete === product.id ? (
          <div className="flex gap-1.5 items-center">
            <span className="text-token-xs text-neutral-600">{tr('Удалить?', "O'chirish?")}</span>
            <Button variant="danger" size="sm" type="button" onClick={() => onConfirmDelete(product.id)}>
              {tr('Да', 'Ha')}
            </Button>
            <Button variant="ghost" size="sm" type="button" onClick={onCancelDelete}>
              {tr('Нет', "Yo'q")}
            </Button>
          </div>
        ) : (
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" type="button" onClick={() => onEdit(product)}>
              {tr('Изменить', 'Tahrirlash')}
            </Button>
            <Button variant="danger" size="sm" type="button" onClick={() => onRequestDelete(product.id)}>
              {tr('Удалить', "O'chirish")}
            </Button>
          </div>
        ),
    },
  ];

  return (
    <Card className="overflow-hidden" style={{ padding: 0 }}>
      <Table
        columns={columns}
        data={products}
        rowKey={(product) => product.id}
        loading={loading}
        emptyMessage={tr('Товаров нет', "Mahsulotlar yo'q")}
      />
      {!loading && totalPages > 1 && (
        <div className="px-3.5 py-3 border-t border-neutral-200 flex items-center justify-between">
          <span className="text-token-xs text-neutral-500">
            {tr('Страница', 'Sahifa')} {page} / {totalPages}
          </span>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" type="button" disabled={page <= 1} onClick={() => onPageChange(Math.max(1, page - 1))}>
              {tr('Назад', 'Orqaga')}
            </Button>
            <Button variant="ghost" size="sm" type="button" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)}>
              {tr('Далее', 'Keyingi')}
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
