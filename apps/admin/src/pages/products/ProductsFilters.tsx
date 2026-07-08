import React from 'react';
import { useAdminI18n } from '../../i18n';
import Card from '../../components/Card';
import Input from '../../components/Input';
import Select from '../../components/Select';
import type { Category } from './types';

interface ProductsFiltersProps {
  search: string;
  onSearchChange: (value: string) => void;
  categories: Category[];
  selectedCategory: string;
  onCategoryChange: (value: string) => void;
  activeFilter: 'all' | 'active' | 'hidden';
  onActiveFilterChange: (value: 'all' | 'active' | 'hidden') => void;
  total: number;
}

export default function ProductsFilters({
  search, onSearchChange, categories, selectedCategory, onCategoryChange, activeFilter, onActiveFilterChange, total,
}: ProductsFiltersProps) {
  const { tr } = useAdminI18n();

  return (
    <Card className="flex gap-2.5 flex-wrap items-center">
      <div className="min-w-[240px] flex-1">
        <Input
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={tr('Поиск по названию, описанию, SKU...', "Nomi, tavsifi, SKU bo'yicha qidirish...")}
        />
      </div>

      <div className="w-52">
        <Select value={selectedCategory} onChange={(e) => onCategoryChange(e.target.value)}>
          <option value="">{tr('Все категории', 'Barcha toifalar')}</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </Select>
      </div>

      <div className="w-44">
        <Select value={activeFilter} onChange={(e) => onActiveFilterChange(e.target.value as 'all' | 'active' | 'hidden')}>
          <option value="all">{tr('Любой статус', 'Har qanday holat')}</option>
          <option value="active">{tr('Только активные', 'Faqat faol')}</option>
          <option value="hidden">{tr('Только скрытые', 'Faqat yashirin')}</option>
        </Select>
      </div>

      {total > 0 && (
        <span className="text-token-xs text-neutral-500">
          {tr('Всего', 'Jami')}: <strong className="text-neutral-700">{total}</strong>
        </span>
      )}
    </Card>
  );
}
