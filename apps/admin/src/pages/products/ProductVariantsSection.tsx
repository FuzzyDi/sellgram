import React from 'react';
import { useAdminI18n } from '../../i18n';
import Card from '../../components/Card';
import Button from '../../components/Button';
import Input from '../../components/Input';
import Table, { type TableColumn } from '../../components/Table';
import type { CategoryAttribute, PendingVariant, Variant } from './types';

interface ProductVariantsSectionProps {
  categoryAttrs: CategoryAttribute[];
  editVariants: Variant[];
  onDeleteVariant: (id: string) => void;
  onToggleVariantActive: (id: string, isActive: boolean) => void;
  newVName: string;
  setNewVName: (value: string) => void;
  newVPrice: string;
  setNewVPrice: (value: string) => void;
  newVStock: string;
  setNewVStock: (value: string) => void;
  addingVariant: boolean;
  onAddVariant: () => void;
  generatorValues: Record<string, string>;
  setGeneratorValues: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  onGenerateVariants: () => void;
  pendingVariants: PendingVariant[];
  setPendingVariants: React.Dispatch<React.SetStateAction<PendingVariant[]>>;
  savingPending: boolean;
  onSavePendingVariants: () => void;
}

export default function ProductVariantsSection({
  categoryAttrs, editVariants, onDeleteVariant, onToggleVariantActive,
  newVName, setNewVName, newVPrice, setNewVPrice, newVStock, setNewVStock, addingVariant, onAddVariant,
  generatorValues, setGeneratorValues, onGenerateVariants,
  pendingVariants, setPendingVariants, savingPending, onSavePendingVariants,
}: ProductVariantsSectionProps) {
  const { tr } = useAdminI18n();

  const pendingColumns: TableColumn<PendingVariant & { index: number }>[] = [
    {
      key: 'name',
      header: tr('Название', 'Nomi'),
      render: (row) => (
        <Input
          value={row.name}
          onChange={(e) => setPendingVariants((prev) => prev.map((r, idx) => idx === row.index ? { ...r, name: e.target.value } : r))}
        />
      ),
    },
    {
      key: 'price',
      header: tr('Цена', 'Narx'),
      width: 130,
      render: (row) => (
        <Input
          type="number"
          value={row.price}
          placeholder={tr('= цена товара', '= mahsulot narxi')}
          onChange={(e) => setPendingVariants((prev) => prev.map((r, idx) => idx === row.index ? { ...r, price: e.target.value } : r))}
        />
      ),
    },
    {
      key: 'stockQty',
      header: tr('Остаток', 'Qoldiq'),
      width: 100,
      render: (row) => (
        <Input
          type="number"
          value={row.stockQty}
          onChange={(e) => setPendingVariants((prev) => prev.map((r, idx) => idx === row.index ? { ...r, stockQty: e.target.value } : r))}
        />
      ),
    },
    {
      key: 'remove',
      header: '',
      width: 36,
      render: (row) => (
        <button type="button" onClick={() => setPendingVariants((prev) => prev.filter((_, idx) => idx !== row.index))} className="bg-transparent border-none cursor-pointer text-danger text-token-lg">×</button>
      ),
    },
  ];

  const existingColumns: TableColumn<Variant>[] = [
    { key: 'name', header: tr('Название', 'Nomi'), render: (v) => <span className="font-semibold text-neutral-800">{v.name}</span> },
    {
      key: 'price',
      header: tr('Цена', 'Narx'),
      render: (v) => (
        <span className={v.price != null ? 'text-neutral-700' : 'text-neutral-400'}>
          {v.price != null ? `${Number(v.price).toLocaleString()} UZS` : tr('= цена товара', '= mahsulot narxi')}
        </span>
      ),
    },
    {
      key: 'stock',
      header: tr('Остаток', 'Qoldiq'),
      render: (v) => (
        <span className={`font-semibold ${v.stockQty === 0 ? 'text-danger' : 'text-neutral-700'}`}>
          {v.stockQty} {tr('шт', 'dona')}
        </span>
      ),
    },
    {
      key: 'status',
      header: '',
      render: (v) => (
        <Button variant="ghost" size="sm" type="button" onClick={() => onToggleVariantActive(v.id, !v.isActive)}>
          {v.isActive ? tr('Скрыть', 'Yashirish') : tr('Показать', "Ko'rsatish")}
        </Button>
      ),
    },
    {
      key: 'delete',
      header: '',
      width: 32,
      render: (v) => (
        <button type="button" onClick={() => onDeleteVariant(v.id)} className="bg-transparent border-none cursor-pointer text-danger text-token-lg">×</button>
      ),
    },
  ];

  return (
    <div className="border-t border-neutral-200 pt-4">
      <div className="flex items-center justify-between mb-2.5">
        <label className="text-token-sm font-semibold text-neutral-800">
          {tr('Варианты', 'Variantlar')}
          {categoryAttrs.length > 0 && (
            <span className="font-normal text-neutral-500"> — {categoryAttrs.map((a) => a.name).join(', ')}</span>
          )}
        </label>
      </div>

      {/* Generator */}
      {categoryAttrs.length > 0 && (
        <Card className="bg-success/5 border-success/30 mb-3">
          <p className="text-token-xs font-semibold text-success mb-2.5">
            {tr('Генератор вариантов', 'Variantlar generatori')}
          </p>
          {categoryAttrs.map((attr) => (
            <div key={attr.id} className="mb-2">
              <label className="text-token-xs text-success block mb-1">{attr.name}:</label>
              <Input
                value={generatorValues[attr.name] || ''}
                onChange={(e) => setGeneratorValues((prev) => ({ ...prev, [attr.name]: e.target.value }))}
                placeholder={tr('S, M, L, XL (через запятую)', 'S, M, L, XL (vergul bilan)')}
              />
            </div>
          ))}
          <Button variant="ghost" size="sm" type="button" className="mt-1" onClick={onGenerateVariants}>
            {tr('Сгенерировать', 'Generatsiya qilish')}
          </Button>
        </Card>
      )}

      {/* Pending (unsaved) variants */}
      {pendingVariants.length > 0 && (
        <div className="mb-3.5 border border-warning/30 rounded-token-lg overflow-hidden">
          <div className="bg-warning/10 px-3.5 py-2 text-token-xs font-semibold text-warning">
            {tr(`Сгенерировано ${pendingVariants.length} вариантов — задайте цену и остаток`, `${pendingVariants.length} ta variant — narx va qoldiqni kiriting`)}
          </div>
          <Table
            columns={pendingColumns}
            data={pendingVariants.map((v, index) => ({ ...v, index }))}
            rowKey={(row) => String(row.index)}
          />
          <div className="px-3.5 py-2.5 flex gap-2">
            <Button variant="primary" size="sm" type="button" disabled={savingPending} onClick={onSavePendingVariants}>
              {savingPending ? tr('Сохранение...', 'Saqlanmoqda...') : tr(`Добавить все (${pendingVariants.length})`, `Hammasini qo'shish (${pendingVariants.length})`)}
            </Button>
            <Button variant="ghost" size="sm" type="button" onClick={() => setPendingVariants([])}>
              {tr('Отмена', 'Bekor')}
            </Button>
          </div>
        </div>
      )}

      {/* Existing variants */}
      {editVariants.length > 0 && (
        <div className="mb-3 border border-neutral-200 rounded-token-lg overflow-hidden">
          <Table columns={existingColumns} data={editVariants} rowKey={(v) => v.id} />
        </div>
      )}

      {/* Add single variant */}
      <div className="flex gap-2 items-end">
        <div className="flex-[2]">
          <Input
            label={tr('Название', 'Nomi')}
            value={newVName}
            onChange={(e) => setNewVName(e.target.value)}
            placeholder={categoryAttrs[0]?.name ? `${tr('Например', 'Masalan')}: XL` : tr('Название варианта', 'Variant nomi')}
          />
        </div>
        <div className="flex-1">
          <Input
            type="number"
            label={tr('Цена (необяз.)', 'Narx (ixtiyoriy)')}
            value={newVPrice}
            onChange={(e) => setNewVPrice(e.target.value)}
            placeholder="—"
          />
        </div>
        <div className="flex-1">
          <Input
            type="number"
            label={tr('Остаток', 'Qoldiq')}
            value={newVStock}
            onChange={(e) => setNewVStock(e.target.value)}
          />
        </div>
        <Button variant="primary" size="md" type="button" className="flex-shrink-0" disabled={!newVName.trim() || addingVariant} onClick={onAddVariant}>
          {addingVariant ? '...' : `+ ${tr('Вариант', 'Variant')}`}
        </Button>
      </div>
    </div>
  );
}
