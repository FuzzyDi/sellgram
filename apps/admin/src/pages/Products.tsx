import React, { useCallback, useRef, useState } from 'react';
import { adminApi } from '../api/store-admin-client';
import { useAdminI18n } from '../i18n';
import Button from '../components/Button';
import Card from '../components/Card';
import Input from '../components/Input';
import ImportModal from './products/ImportModal';
import ProductsFilters from './products/ProductsFilters';
import BulkActionBar from './products/BulkActionBar';
import ProductsTable from './products/ProductsTable';
import ProductForm from './products/ProductForm';
import { useProducts } from './products/useProducts';
import { useProductForm } from './products/useProductForm';
import { useProductVariants } from './products/useProductVariants';
import type { NoticeTone, Product } from './products/types';


function FirstProductStarter({ onCreated }: { onCreated: () => Promise<void> }) {
  const { tr } = useAdminI18n();
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [stockQty, setStockQty] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const cleanName = name.trim();
    const parsedPrice = Number(price);
    if (!cleanName || !Number.isFinite(parsedPrice) || parsedPrice < 0) {
      setError(tr('Введите название и цену', 'Nomi va narxini kiriting'));
      return;
    }
    setSaving(true);
    setError('');
    try {
      await adminApi.createProduct({
        name: cleanName,
        price: parsedPrice,
        stockQty: Number(stockQty) > 0 ? Math.floor(Number(stockQty)) : 0,
        lowStockAlert: 0,
        unit: 'шт',
        isActive: true,
        showInMiniapp: true,
      });
      await onCreated();
      setName('');
      setPrice('');
      setStockQty('');
    } catch (err: any) {
      setError(err?.message || tr('Не удалось создать товар', 'Mahsulot yaratib bo\'lmadi'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="border border-accent-600/20 bg-accent-50/40" style={{ padding: 20 }}>
      <div className="grid gap-4 lg:grid-cols-[1fr_1.4fr] lg:items-start">
        <div>
          <div className="text-token-xs font-bold uppercase text-accent-700 mb-1">{tr('Первый товар', 'Birinchi mahsulot')}</div>
          <h3 className="m-0 text-token-xl font-extrabold text-neutral-900">{tr('Магазин готов. Добавьте товар за 30 секунд', "Do'kon tayyor. Mahsulotni 30 soniyada qo'shing")}</h3>
          <p className="mt-2 mb-0 text-token-sm text-neutral-600">
            {tr('Заполните только название и цену. Фото, категорию, остатки и остальные поля можно добавить позже.', "Faqat nom va narxni kiriting. Rasm, toifa, qoldiq va boshqa maydonlarni keyin qo'shish mumkin.")}
          </p>
        </div>
        <form onSubmit={submit} className="bg-white rounded-token-lg border border-neutral-100 p-3.5 flex flex-col gap-3">
          {error && <div className="text-token-sm text-danger bg-danger/10 border border-danger/20 rounded-token-md px-3 py-2">{error}</div>}
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_150px_120px] gap-2.5">
            <Input label={`${tr('Название', 'Nomi')} *`} value={name} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setName(e.target.value)} placeholder={tr('Например: Духи Amina', 'Masalan: Amina atiri')} />
            <Input label={`${tr('Цена', 'Narx')} *`} type="number" value={price} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPrice(e.target.value)} placeholder="120000" />
            <Input label={tr('Остаток', 'Qoldiq')} type="number" value={stockQty} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setStockQty(e.target.value)} placeholder="0" />
          </div>
          <div className="flex gap-2 flex-wrap items-center">
            <Button variant="primary" size="md" type="submit" disabled={saving}>{saving ? '...' : tr('Создать первый товар', 'Birinchi mahsulotni yaratish')}</Button>
            <span className="text-token-xs text-neutral-400">{tr('Товар сразу появится в miniapp', "Mahsulot darhol miniapp'da ko'rinadi")}</span>
          </div>
        </form>
      </div>
    </Card>
  );
}

export default function Products() {
  const { tr } = useAdminI18n();
  const [notice, setNotice] = useState<{ tone: NoticeTone; message: string } | null>(null);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [showImport, setShowImport] = useState(false);

  const showNotice = useCallback((tone: NoticeTone, message: string) => {
    setNotice({ tone, message });
    setTimeout(() => setNotice(null), 3200);
  }, []);

  const list = useProducts(showNotice);
  const hasNoProducts = !list.loading && !list.loadError && list.total === 0 && !list.search && !list.selectedCategory && !list.activeFilter && !list.miniappFilter;
  const handleFirstProductCreated = useCallback(async () => {
    await list.loadProducts();
    showNotice('success', tr('Первый товар создан. Он уже доступен в miniapp.', "Birinchi mahsulot yaratildi. U miniapp'da mavjud."));
  }, [list.loadProducts, showNotice, tr]);

  // Two hooks with a circular data need: openEdit (form) must reset
  // variant state, but variant state needs the form's editingId/categoryId.
  // Resolved via a ref so declaration order doesn't matter — see
  // useProductForm.ts's comment.
  const variantsRef = useRef<ReturnType<typeof useProductVariants> | null>(null);
  const onEditLoaded = useCallback((fullProduct: any) => {
    variantsRef.current?.resetForProduct(fullProduct);
  }, []);

  const form = useProductForm({
    loadProducts: list.loadProducts,
    loadCategories: list.loadCategories,
    showNotice,
    onEditLoaded,
  });

  const variants = useProductVariants(form.editingId, list.categories, form.form.categoryId, showNotice);
  variantsRef.current = variants;

  const removeProduct = useCallback(
    async (id: string) => {
      setPendingDelete(null);
      try {
        await adminApi.deleteProduct(id);
        await list.loadProducts();
      } catch (err: any) {
        showNotice('error', err?.message || tr('Ошибка', 'Xatolik'));
      }
    },
    [list.loadProducts, showNotice, tr]
  );

  const noticeNode = notice ? (
    <div
      className={[
        'fixed top-[18px] right-[18px] z-[70] min-w-[280px] max-w-[440px] rounded-token-lg px-3.5 py-3 text-token-sm font-semibold shadow-sm border',
        notice.tone === 'error' ? 'bg-danger/10 text-danger border-danger/30'
          : notice.tone === 'success' ? 'bg-success/10 text-success border-success/30'
          : 'bg-accent-600/10 text-accent-600 border-accent-600/30',
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
      <header className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-token-2xl font-semibold text-neutral-800">{tr('Товары', 'Mahsulotlar')}</h2>
          <p className="mt-1 text-token-sm text-neutral-500">{tr('Каталог магазина и остатки', "Do'kon katalogi va ombor qoldiqlari")}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" size="md" type="button" onClick={() => setShowImport(true)}>
            ↑ {tr('Импорт', 'Import')}
          </Button>
          <Button variant="primary" size="md" type="button" onClick={form.openCreate}>
            + {tr('Добавить', "Qo'shish")}
          </Button>
        </div>
      </header>

      {hasNoProducts && <FirstProductStarter onCreated={handleFirstProductCreated} />}

      <ProductsFilters
        search={list.search}
        onSearchChange={(v) => { list.setPage(1); list.setSearch(v); }}
        categories={list.categories}
        selectedCategory={list.selectedCategory}
        onCategoryChange={(v) => { list.setPage(1); list.setSelectedCategory(v); }}
        activeFilter={list.activeFilter}
        onActiveFilterChange={(v) => { list.setPage(1); list.setActiveFilter(v); }}
        miniappFilter={list.miniappFilter}
        onMiniappFilterChange={(v) => { list.setPage(1); list.setMiniappFilter(v); }}
        total={list.total}
      />

      {list.selected.size > 0 && (
        <BulkActionBar
          count={list.selected.size}
          bulking={list.bulking}
          onActivate={() => void list.handleBulkAction('activate')}
          onDeactivate={() => void list.handleBulkAction('deactivate')}
          onShowInMiniapp={() => void list.handleBulkAction('showInMiniapp')}
          onHideFromMiniapp={() => void list.handleBulkAction('hideFromMiniapp')}
          onCancel={() => list.setSelected(new Set())}
        />
      )}

      <ProductsTable
        products={list.products}
        loading={list.loading}
        loadError={list.loadError}
        onRetry={() => void list.loadProducts()}
        selected={list.selected}
        onToggleSelect={list.toggleSelect}
        onToggleSelectAll={list.toggleSelectAll}
        pendingDelete={pendingDelete}
        onRequestDelete={setPendingDelete}
        onCancelDelete={() => setPendingDelete(null)}
        onConfirmDelete={(id) => void removeProduct(id)}
        onEdit={(product: Product) => void form.openEdit(product)}
        page={list.page}
        totalPages={list.totalPages}
        onPageChange={list.setPage}
        emptyMessage={hasNoProducts ? tr('Создайте первый товар выше', 'Yuqorida birinchi mahsulotni yarating') : undefined}
      />

      {showImport && (
        <ImportModal
          onClose={() => setShowImport(false)}
          onImported={() => { setShowImport(false); void list.loadProducts(); }}
        />
      )}

      {form.showForm && (
        <ProductForm
          key={form.editingId ?? 'new'}
          editingId={form.editingId}
          form={form.form}
          updateForm={form.updateForm}
          error={form.error}
          saving={form.saving}
          categories={list.categories}
          productTypes={list.productTypes}
          onSelectProductType={(typeId) => form.selectProductType(list.productTypes, typeId)}
          showCatForm={form.showCatForm}
          onToggleCatForm={() => form.setShowCatForm((prev) => !prev)}
          catName={form.catName}
          setCatName={form.setCatName}
          onCreateCategory={() => void form.createCategory()}
          onSubmit={() => void form.saveProduct()}
          onClose={() => form.setShowForm(false)}
          editImages={form.editImages}
          uploading={form.uploading}
          fileInputRef={form.fileInputRef}
          onUploadImages={form.uploadImages}
          onRemoveImage={(id) => void form.removeImage(id)}
          showNotice={showNotice}
          variantsSectionProps={{
            editVariants: variants.editVariants,
            onDeleteVariant: (id) => void variants.deleteVariant(id),
            onToggleVariantActive: (id, isActive) => void variants.toggleVariantActive(id, isActive),
            newVName: variants.newVName,
            setNewVName: variants.setNewVName,
            newVPrice: variants.newVPrice,
            setNewVPrice: variants.setNewVPrice,
            newVStock: variants.newVStock,
            setNewVStock: variants.setNewVStock,
            addingVariant: variants.addingVariant,
            onAddVariant: () => void variants.addVariant(),
            generatorValues: variants.generatorValues,
            setGeneratorValues: variants.setGeneratorValues,
            onGenerateVariants: variants.generateVariants,
            pendingVariants: variants.pendingVariants,
            setPendingVariants: variants.setPendingVariants,
            savingPending: variants.savingPending,
            onSavePendingVariants: () => void variants.savePendingVariants(),
          }}
        />
      )}
    </section>
  );
}
