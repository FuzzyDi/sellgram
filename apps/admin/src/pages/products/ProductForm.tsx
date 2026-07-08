import React from 'react';
import { toImageUrl } from '../../api/store-admin-client';
import { useAdminI18n } from '../../i18n';
import Card from '../../components/Card';
import Button from '../../components/Button';
import Input from '../../components/Input';
import Select from '../../components/Select';
import ProductVariantsSection from './ProductVariantsSection';
import type { Category, FormData as ProductFormData } from './types';

interface ProductFormProps {
  editingId: string | null;
  form: ProductFormData;
  updateForm: (field: keyof ProductFormData) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => void;
  error: string;
  saving: boolean;
  categories: Category[];
  showCatForm: boolean;
  onToggleCatForm: () => void;
  catName: string;
  setCatName: (value: string) => void;
  onCreateCategory: () => void;
  onSubmit: () => void;
  onClose: () => void;
  editImages: { id: string; url: string }[];
  uploading: boolean;
  fileInputRef: React.RefObject<HTMLInputElement>;
  onUploadImages: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onRemoveImage: (id: string) => void;
  variantsSectionProps: Omit<React.ComponentProps<typeof ProductVariantsSection>, 'categoryAttrs'>;
}

export default function ProductForm({
  editingId, form, updateForm, error, saving, categories,
  showCatForm, onToggleCatForm, catName, setCatName, onCreateCategory,
  onSubmit, onClose,
  editImages, uploading, fileInputRef, onUploadImages, onRemoveImage,
  variantsSectionProps,
}: ProductFormProps) {
  const { tr } = useAdminI18n();
  const categoryAttrs = categories.find((c) => c.id === form.categoryId)?.attributes || [];

  return (
    <div className="fixed inset-0 bg-black/45 flex items-center justify-center z-50 p-4">
      <Card className="w-full max-w-[860px] max-h-[90vh] overflow-y-auto">
        <h3 className="m-0 text-token-2xl font-semibold text-neutral-800">
          {editingId ? tr('Редактировать товар', 'Mahsulotni tahrirlash') : tr('Новый товар', 'Yangi mahsulot')}
        </h3>
        <p className="mt-1 text-token-sm text-neutral-500">{tr('Управляйте карточкой товара и медиа', 'Mahsulot kartasi va media fayllarni boshqaring')}</p>

        {error && <div className="mt-2.5 bg-danger/5 text-danger border border-danger/30 rounded-token-md px-3 py-2.5 text-token-sm">{error}</div>}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit();
          }}
          className="flex flex-col gap-3 mt-3"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input label={`${tr('Название', 'Nomi')} *`} value={form.name} onChange={updateForm('name')} />
            <Input label="SKU" value={form.sku} onChange={updateForm('sku')} />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Input type="number" label={`${tr('Цена (UZS)', 'Narx (UZS)')} *`} value={form.price} onChange={updateForm('price')} />
            <Input type="number" label={tr('Себестоимость', 'Tannarx')} value={form.costPrice} onChange={updateForm('costPrice')} />
            <Input label={tr('Ед. измерения', "O'lchov birligi")} value={form.unit} onChange={updateForm('unit')} />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Input type="number" label={tr('Остаток', 'Qoldiq')} value={form.stockQty} onChange={updateForm('stockQty')} />
            <Input type="number" label={tr('Мин. остаток', 'Min. qoldiq')} value={form.lowStockAlert} onChange={updateForm('lowStockAlert')} />
            <Select label={tr('Категория', 'Toifa')} value={form.categoryId} onChange={updateForm('categoryId')}>
              <option value="">{tr('Без категории', 'Toifasiz')}</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </Select>
          </div>

          <div>
            <Button variant="ghost" size="sm" type="button" onClick={onToggleCatForm}>
              + {tr('Создать категорию', 'Toifa yaratish')}
            </Button>
            {showCatForm && (
              <div className="flex gap-2 mt-2.5">
                <div className="flex-1">
                  <Input value={catName} onChange={(e) => setCatName(e.target.value)} placeholder={tr('Название категории', 'Toifa nomi')} />
                </div>
                <Button variant="primary" size="md" type="button" onClick={onCreateCategory}>
                  {tr('Создать', 'Yaratish')}
                </Button>
              </div>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-token-sm font-medium text-neutral-700">{tr('Описание', 'Tavsif')}</label>
            <textarea
              value={form.description}
              onChange={updateForm('description')}
              rows={3}
              className="w-full rounded-token-md border border-neutral-300 px-3 py-2 text-token-sm text-neutral-800 placeholder:text-neutral-400 bg-white focus:outline-none focus:ring-2 focus:ring-accent-500/30 focus:border-accent-500 resize-y"
            />
          </div>

          <label className="flex items-center gap-2 text-token-sm text-neutral-700">
            <input type="checkbox" className="h-4 w-4 accent-accent-600" checked={form.isActive} onChange={updateForm('isActive')} />
            {tr('Активен (виден покупателям)', "Faol (mijozlarga ko'rinadi)")}
          </label>

          {editingId && (
            <div>
              <label className="text-token-sm font-medium text-neutral-700 block mb-2">{tr('Фотографии', 'Rasmlar')}</label>
              <div className="flex gap-2 flex-wrap">
                {editImages.map((image) => (
                  <div key={image.id} className="w-[88px] h-[88px] rounded-token-md overflow-hidden relative border border-neutral-200">
                    <img src={toImageUrl(image.url)} alt="product" className="w-full h-full object-cover" />
                    <button type="button" onClick={() => onRemoveImage(image.id)} className="absolute right-1 top-1 bg-danger text-white border-none rounded-full w-5 h-5 cursor-pointer text-token-xs leading-none">
                      x
                    </button>
                  </div>
                ))}
                <label className="w-[88px] h-[88px] rounded-token-md border-2 border-dashed border-neutral-300 flex items-center justify-center cursor-pointer text-neutral-500 text-token-xs text-center">
                  {uploading ? tr('Загрузка...', 'Yuklanmoqda...') : tr('Добавить', "Qo'shish")}
                  <input ref={fileInputRef} type="file" accept="image/*" multiple onChange={onUploadImages} className="hidden" />
                </label>
              </div>
            </div>
          )}

          {!editingId && <p className="text-token-sm text-neutral-500">{tr('Фото и варианты можно добавить после создания товара', "Rasm va variantlarni mahsulot yaratilgandan keyin qo'shish mumkin")}</p>}

          {editingId && (
            <ProductVariantsSection categoryAttrs={categoryAttrs} {...variantsSectionProps} />
          )}

          <div className="flex gap-2.5 mt-1">
            <Button variant="primary" size="md" type="submit" disabled={saving}>
              {saving ? tr('Сохранение...', 'Saqlanmoqda...') : editingId ? tr('Сохранить', 'Saqlash') : tr('Создать товар', 'Mahsulot yaratish')}
            </Button>
            <Button variant="ghost" size="md" type="button" onClick={onClose}>
              {tr('Отмена', 'Bekor qilish')}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
