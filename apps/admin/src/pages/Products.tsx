import React, { useCallback, useRef, useState } from 'react';
import { adminApi } from '../api/store-admin-client';
import { useAdminI18n } from '../i18n';
import Button from '../components/Button';
import ImportModal from './products/ImportModal';
import ProductsFilters from './products/ProductsFilters';
import BulkActionBar from './products/BulkActionBar';
import ProductsTable from './products/ProductsTable';
import ProductForm from './products/ProductForm';
import { useProducts } from './products/useProducts';
import { useProductForm } from './products/useProductForm';
import { useProductVariants } from './products/useProductVariants';
import type { NoticeTone, Product } from './products/types';

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
      <header className="flex items-center justify-between gap-3">
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

      <ProductsFilters
        search={list.search}
        onSearchChange={(v) => { list.setPage(1); list.setSearch(v); }}
        categories={list.categories}
        selectedCategory={list.selectedCategory}
        onCategoryChange={(v) => { list.setPage(1); list.setSelectedCategory(v); }}
        activeFilter={list.activeFilter}
        onActiveFilterChange={(v) => { list.setPage(1); list.setActiveFilter(v); }}
        total={list.total}
      />

      {list.selected.size > 0 && (
        <BulkActionBar
          count={list.selected.size}
          bulking={list.bulking}
          onActivate={() => void list.handleBulkAction('activate')}
          onDeactivate={() => void list.handleBulkAction('deactivate')}
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
