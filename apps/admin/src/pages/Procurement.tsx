import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { adminApi } from '../api/store-admin-client';
import { useAdminI18n } from '../i18n';
import Card from '../components/Card';
import Button from '../components/Button';
import Table from '../components/Table';
import CreatePurchaseOrderForm from './procurement/CreatePurchaseOrderForm';
import PurchaseOrderCard from './procurement/PurchaseOrderCard';
import ReceivePurchaseOrderModal from './procurement/ReceivePurchaseOrderModal';
import CreateReturnForm from './procurement/CreateReturnForm';
import ReturnCard from './procurement/ReturnCard';
import CreateWriteOffForm from './procurement/CreateWriteOffForm';
import WriteOffCard from './procurement/WriteOffCard';
import CreateCustomerReturnForm from './procurement/CreateCustomerReturnForm';
import CustomerReturnCard from './procurement/CustomerReturnCard';
import CreateStockCountForm from './procurement/CreateStockCountForm';
import StockCountCard from './procurement/StockCountCard';
import CreatePriceRevisionForm from './procurement/CreatePriceRevisionForm';
import PriceRevisionCard from './procurement/PriceRevisionCard';
import CreateConsignmentSettlementForm from './procurement/CreateConsignmentSettlementForm';
import ConsignmentSettlementCard from './procurement/ConsignmentSettlementCard';
import { usePurchaseOrderDocuments, PO_TRANSITIONS, statusBadgeVariant } from './procurement/usePurchaseOrderDocuments';
import { useSupplierReturns } from './procurement/useSupplierReturns';
import { useStockWriteOffs } from './procurement/useStockWriteOffs';
import { useCustomerReturns } from './procurement/useCustomerReturns';
import { useStockCounts } from './procurement/useStockCounts';
import { usePriceRevisions } from './procurement/usePriceRevisions';
import { useConsignmentSettlements } from './procurement/useConsignmentSettlements';
import type { POStatus } from './procurement/types';

type NoticeTone = 'success' | 'error';
type DocTab = 'documents' | 'returns' | 'writeoffs' | 'customerReturns' | 'stockCounts' | 'priceRevisions' | 'consignmentSettlements';

// Procurement.tsx is the thin orchestrator: shared list-loading (one
// Promise.all — every tab's data arrives together, one loading spinner)
// and tab-switching chrome. Each tab's own state, derived values, and
// server-mutating handlers live in its own hook (pages/procurement/
// use<X>.tsx), mirroring how pages/products/ split Products.tsx — see
// docs/ADMIN_REDESIGN.md §7 Phase 3.
export default function Procurement() {
  const { tr } = useAdminI18n();
  const navigate = useNavigate();
  const [pos, setPos] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [counterparties, setCounterparties] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [planBlocked, setPlanBlocked] = useState(false);
  const [notice, setNotice] = useState<{ tone: NoticeTone; message: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<DocTab>('documents');

  const [returns, setReturns] = useState<any[]>([]);
  const [writeOffs, setWriteOffs] = useState<any[]>([]);
  const [customerReturns, setCustomerReturns] = useState<any[]>([]);
  const [stockCounts, setStockCounts] = useState<any[]>([]);
  const [priceRevisions, setPriceRevisions] = useState<any[]>([]);
  const [consignmentSettlements, setConsignmentSettlements] = useState<any[]>([]);

  function showNotice(tone: NoticeTone, message: string) {
    setNotice({ tone, message });
    setTimeout(() => setNotice(null), 3200);
  }

  async function load() {
    setLoading(true);
    try {
      const [poList, productList, supplierList, returnList, writeOffList, customerReturnList, counterpartyList, stockCountList, priceRevisionList, consignmentSettlementList] = await Promise.all([
        adminApi.getPurchaseOrders(),
        adminApi.getProducts('pageSize=500'),
        adminApi.getSuppliers().catch(() => []),
        adminApi.getSupplierReturns().catch(() => []),
        adminApi.getStockWriteOffs().catch(() => []),
        adminApi.getCustomerReturns().catch(() => []),
        adminApi.getCounterparties().catch(() => []),
        adminApi.getStockCounts().catch(() => []),
        adminApi.getPriceRevisions().catch(() => []),
        adminApi.getConsignmentSettlements().catch(() => []),
      ]);
      setPos(Array.isArray(poList?.items ?? poList) ? (poList?.items ?? poList) : []);
      setProducts(Array.isArray(productList?.items ?? productList) ? (productList?.items ?? productList) : []);
      setSuppliers(Array.isArray(supplierList) ? supplierList : []);
      setReturns(Array.isArray(returnList?.items ?? returnList) ? (returnList?.items ?? returnList) : []);
      setWriteOffs(Array.isArray(writeOffList?.items ?? writeOffList) ? (writeOffList?.items ?? writeOffList) : []);
      setCustomerReturns(Array.isArray(customerReturnList?.items ?? customerReturnList) ? (customerReturnList?.items ?? customerReturnList) : []);
      setCounterparties(Array.isArray(counterpartyList?.items ?? counterpartyList) ? (counterpartyList?.items ?? counterpartyList) : []);
      setStockCounts(Array.isArray(stockCountList?.items ?? stockCountList) ? (stockCountList?.items ?? stockCountList) : []);
      setPriceRevisions(Array.isArray(priceRevisionList?.items ?? priceRevisionList) ? (priceRevisionList?.items ?? priceRevisionList) : []);
      setConsignmentSettlements(Array.isArray(consignmentSettlementList?.items ?? consignmentSettlementList) ? (consignmentSettlementList?.items ?? consignmentSettlementList) : []);
    } catch (err: any) {
      if (err?.message?.includes('402') || err?.message?.toLowerCase().includes('plan')) {
        setPlanBlocked(true);
      } else {
        showNotice('error', err?.message || tr('Ошибка загрузки', 'Yuklash xatosi'));
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  const poHook = usePurchaseOrderDocuments({ pos, suppliers, saving, setSaving, showNotice, load });
  const returnsHook = useSupplierReturns({ returns, saving, setSaving, showNotice, load });
  const writeOffsHook = useStockWriteOffs({ writeOffs, saving, setSaving, showNotice, load });
  const customerReturnsHook = useCustomerReturns({ customerReturns, saving, setSaving, showNotice, load });
  const stockCountsHook = useStockCounts({ stockCounts, saving, setSaving, showNotice, load });
  const priceRevisionsHook = usePriceRevisions({ priceRevisions, saving, setSaving, showNotice, load });
  const consignmentHook = useConsignmentSettlements({ pos, consignmentSettlements, saving, setSaving, showNotice, load });

  // Supplier returns and write-offs may optionally link back to a
  // purchase order for traceability ("these arrived damaged, see PO-X")
  // — only meaningful once the shipment has actually arrived, so the
  // picker only offers RECEIVED documents (server enforces this too).
  const receivedPos = pos.filter((po: any) => po.status === 'RECEIVED');

  const noticeNode = notice ? (
    <div
      className={[
        'fixed top-[18px] right-[18px] z-[70] min-w-[280px] max-w-[440px] rounded-token-lg px-3.5 py-3 text-token-sm font-semibold shadow-sm border',
        notice.tone === 'error' ? 'bg-danger/10 text-danger border-danger/30' : 'bg-success/10 text-success border-success/30',
      ].join(' ')}
      role="status"
      aria-live="polite"
    >
      {notice.message}
    </div>
  ) : null;

  if (planBlocked) {
    return (
      <section className="flex flex-col gap-4">
        <header>
          <h2 className="text-token-2xl font-semibold text-neutral-800">{tr('Документы', 'Hujjatlar')}</h2>
        </header>
        <Card className="text-center py-8 px-4">
          <div className="text-token-2xl mb-3">🔒</div>
          <p className="m-0 font-semibold text-token-lg text-neutral-800">{tr('Доступно на PRO и BUSINESS', 'PRO va BUSINESS tariflarida mavjud')}</p>
          <p className="mt-1.5 text-token-sm text-neutral-500">{tr('Управление поставщиками и складскими остатками', 'Yetkazib beruvchilar va ombor qoldiqlarini boshqarish')}</p>
          <Button variant="primary" size="md" type="button" className="mt-4" onClick={() => navigate('/billing')}>
            {tr('Обновить тариф', 'Tarifni yangilash')}
          </Button>
        </Card>
      </section>
    );
  }

  if (loading) {
    return (
      <section className="flex flex-col gap-4">
        <div>
          <div className="h-7 w-[30%] rounded-token-sm bg-neutral-100 animate-pulse" />
          <div className="h-3.5 w-1/2 rounded-token-sm bg-neutral-100 animate-pulse mt-2" />
        </div>
        {[1, 2, 3].map((i) => (
          <Card key={i}>
            <div className="h-5 w-2/5 rounded-token-sm bg-neutral-100 animate-pulse mb-2" />
            <div className="h-3.5 w-[70%] rounded-token-sm bg-neutral-100 animate-pulse" />
          </Card>
        ))}
      </section>
    );
  }

  const headerTitle: Record<DocTab, string> = {
    documents: tr('Приходные документы', 'Kirim hujjatlari'),
    returns: tr('Возвраты поставщику', "Ta'minotchiga qaytarishlar"),
    writeoffs: tr('Списания', 'Hisobdan chiqarishlar'),
    customerReturns: tr('Возвраты от клиента', "Mijozdan qaytarishlar"),
    stockCounts: tr('Инвентаризация', 'Inventarizatsiya'),
    priceRevisions: tr('Переоценка', "Qayta baholash"),
    consignmentSettlements: tr('Реализация', "Realizatsiya"),
  };

  const headerSubtitle: Record<DocTab, string> = {
    documents: tr('Документы от поставщиков: товары, количество, закупочные цены и способ оплаты', "Yetkazib beruvchilardan hujjatlar: mahsulotlar, miqdor, sotib olish narxi va to'lov usuli"),
    returns: tr('Товары, отправленные обратно поставщику: остатки и долг уменьшаются', "Ta'minotchiga qaytarilgan tovarlar: qoldiq va qarz kamayadi"),
    writeoffs: tr('Списание не по продаже: брак, порча, недостача, собственные нужды — только остатки, без денег', "Sotuvsiz hisobdan chiqarish: nuqsonli, shikastlangan, yetishmovchilik, o'z ehtiyoji — faqat qoldiq, pulsiz"),
    customerReturns: tr('Товары, возвращённые клиентом: остатки увеличиваются, а долг клиента (если он выбран) уменьшается', "Mijoz tomonidan qaytarilgan tovarlar: qoldiq ko'payadi, mijoz qarzi (tanlangan bo'lsa) kamayadi"),
    stockCounts: tr('Снимок остатков на момент начала подсчёта — сверьте с фактом и подтвердите, расхождения применятся к остаткам', "Hisoblash boshlangan paytdagi qoldiqlar tasviri — faktik bilan solishtiring va tasdiqlang, farqlar qoldiqqa qo'llaniladi"),
    priceRevisions: tr('Изменение розничных цен по каналам: Telegram, POS, опт — вручную выбранные товары', "Kanallar bo'yicha chakana narxlarni o'zgartirish: Telegram, POS, ulgurji — qo'lda tanlangan mahsulotlar"),
    consignmentSettlements: tr('Отчёты о фактически проданном по документам «под реализацию» — долг поставщику начисляется только за реализованное', "«Realizatsiyaga» hujjatlar bo'yicha sotilgan haqida hisobotlar — ta'minotchi qarzi faqat sotilgani uchun hisoblanadi"),
  };

  const createButtonLabel: Record<DocTab, string> = {
    documents: tr('+ Новый документ', '+ Yangi hujjat'),
    returns: tr('+ Новый возврат', '+ Yangi qaytarish'),
    writeoffs: tr('+ Новое списание', '+ Yangi hisobdan chiqarish'),
    customerReturns: tr('+ Новый возврат', '+ Yangi qaytarish'),
    stockCounts: tr('+ Начать инвентаризацию', '+ Inventarizatsiyani boshlash'),
    priceRevisions: tr('+ Новая переоценка', "+ Yangi qayta baholash"),
    consignmentSettlements: tr('+ Новый отчёт', "+ Yangi hisobot"),
  };

  function onCreateClick() {
    if (tab === 'documents') poHook.setShowCreate(true);
    else if (tab === 'returns') returnsHook.setShowCreateReturn(true);
    else if (tab === 'writeoffs') writeOffsHook.setShowCreateWriteOff(true);
    else if (tab === 'customerReturns') customerReturnsHook.setShowCreateCustomerReturn(true);
    else if (tab === 'stockCounts') stockCountsHook.setShowCreateStockCount(true);
    else if (tab === 'priceRevisions') priceRevisionsHook.setShowCreatePriceRevision(true);
    else consignmentHook.setShowCreateConsignmentSettlement(true);
  }

  const createDisabled = tab === 'documents' ? poHook.showCreate
    : tab === 'returns' ? returnsHook.showCreateReturn
    : tab === 'writeoffs' ? writeOffsHook.showCreateWriteOff
    : tab === 'customerReturns' ? customerReturnsHook.showCreateCustomerReturn
    : tab === 'stockCounts' ? stockCountsHook.showCreateStockCount
    : tab === 'priceRevisions' ? priceRevisionsHook.showCreatePriceRevision
    : consignmentHook.showCreateConsignmentSettlement;

  return (
    <section className="flex flex-col gap-4">
      {noticeNode}

      <header className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-token-2xl font-semibold text-neutral-800">{headerTitle[tab]}</h2>
          <p className="mt-1 text-token-sm text-neutral-500">{headerSubtitle[tab]}</p>
        </div>
        <Button variant="primary" size="md" type="button" onClick={onCreateClick} disabled={createDisabled}>
          {createButtonLabel[tab]}
        </Button>
      </header>

      <div className="flex gap-1 flex-wrap">
        <Button type="button" variant={tab === 'documents' ? 'primary' : 'ghost'} size="sm" onClick={() => setTab('documents')}>
          {tr('Приходные', 'Kirim')}
        </Button>
        <Button type="button" variant={tab === 'writeoffs' ? 'primary' : 'ghost'} size="sm" onClick={() => setTab('writeoffs')}>
          {tr('Списания', 'Hisobdan chiqarish')}
        </Button>
        <Button type="button" variant={tab === 'returns' ? 'primary' : 'ghost'} size="sm" onClick={() => setTab('returns')}>
          {tr('Возврат поставщику', "Ta'minotchiga qaytarish")}
        </Button>
        <Button type="button" variant={tab === 'customerReturns' ? 'primary' : 'ghost'} size="sm" onClick={() => setTab('customerReturns')}>
          {tr('Возврат от клиента', 'Mijozdan qaytarish')}
        </Button>
        <Button type="button" variant={tab === 'stockCounts' ? 'primary' : 'ghost'} size="sm" onClick={() => setTab('stockCounts')}>
          {tr('Инвентаризация', 'Inventarizatsiya')}
        </Button>
        <Button type="button" variant={tab === 'priceRevisions' ? 'primary' : 'ghost'} size="sm" onClick={() => setTab('priceRevisions')}>
          {tr('Переоценка', "Qayta baholash")}
        </Button>
        <Button type="button" variant={tab === 'consignmentSettlements' ? 'primary' : 'ghost'} size="sm" onClick={() => setTab('consignmentSettlements')}>
          {tr('Реализация', "Realizatsiya")}
        </Button>
      </div>

      {tab === 'documents' && (
        <>
          {poHook.showCreate && (
            <CreatePurchaseOrderForm
              suppliers={suppliers}
              products={products}
              existingDocs={pos}
              supplierId={poHook.supplierId}
              setSupplierId={poHook.setSupplierId}
              supplier={poHook.supplier}
              setSupplier={poHook.setSupplier}
              paymentMethod={poHook.paymentMethod}
              setPaymentMethod={poHook.setPaymentMethod}
              relatesToId={poHook.relatesToId}
              setRelatesToId={poHook.setRelatesToId}
              currency={poHook.currency}
              setCurrency={poHook.setCurrency}
              fxRate={poHook.fxRate}
              setFxRate={poHook.setFxRate}
              shippingCost={poHook.shippingCost}
              setShippingCost={poHook.setShippingCost}
              customsCost={poHook.customsCost}
              setCustomsCost={poHook.setCustomsCost}
              note={poHook.note}
              setNote={poHook.setNote}
              items={poHook.items}
              addItem={poHook.addItem}
              removeItem={poHook.removeItem}
              updateItem={poHook.updateItem}
              createTotal={poHook.createTotal}
              saving={saving}
              onSubmit={() => void poHook.submitCreate()}
              onCancel={poHook.resetCreateForm}
            />
          )}

          {pos.length === 0 && !poHook.showCreate ? (
            <Card className="text-center py-10 px-4">
              <p className="m-0 text-token-sm text-neutral-500">{tr('Приходных документов пока нет', "Hali kirim hujjatlari yo'q")}</p>
            </Card>
          ) : (
            <Table
              columns={poHook.documentColumns}
              data={pos}
              rowKey={(po) => po.id}
              onRowClick={(po) => poHook.setSelectedPoId((prev) => (prev === po.id ? null : po.id))}
            />
          )}

          {poHook.selectedPo && (() => {
            const status = poHook.selectedPo.status as POStatus;
            const transitions = PO_TRANSITIONS[status] || [];
            const canReceive = status === 'IN_TRANSIT';
            return (
              <PurchaseOrderCard
                key={poHook.selectedPo.id}
                po={poHook.selectedPo}
                transitions={transitions}
                canReceive={canReceive}
                statusLabel={poHook.statusLabel}
                statusBadgeVariant={statusBadgeVariant}
                saving={saving}
                onTransition={(poId, next) => void poHook.transition(poId, next)}
                onReceive={poHook.openReceive}
                products={products}
                canEditItems={status === 'DRAFT' || status === 'ORDERED' || status === 'IN_TRANSIT'}
                onAddItem={(data) => void poHook.addPoItem(poHook.selectedPo.id, data)}
                onUpdateItem={(itemId, data) => void poHook.updatePoItem(poHook.selectedPo.id, itemId, data)}
                onRemoveItem={(itemId) => void poHook.removePoItem(poHook.selectedPo.id, itemId)}
                canEditReceivedNote={poHook.canEditReceived}
                onSaveNote={(noteValue) => void poHook.savePoNote(poHook.selectedPo.id, noteValue)}
              />
            );
          })()}
        </>
      )}

      {tab === 'returns' && (
        <>
          {returnsHook.showCreateReturn && (
            <CreateReturnForm
              suppliers={suppliers}
              products={products}
              purchaseOrders={receivedPos}
              supplierId={returnsHook.returnSupplierId}
              setSupplierId={returnsHook.setReturnSupplierId}
              purchaseOrderId={returnsHook.returnPurchaseOrderId}
              setPurchaseOrderId={returnsHook.setReturnPurchaseOrderId}
              currency={returnsHook.returnCurrency}
              setCurrency={returnsHook.setReturnCurrency}
              fxRate={returnsHook.returnFxRate}
              setFxRate={returnsHook.setReturnFxRate}
              note={returnsHook.returnNote}
              setNote={returnsHook.setReturnNote}
              items={returnsHook.returnItems}
              addItem={returnsHook.addReturnItem}
              removeItem={returnsHook.removeReturnItem}
              updateItem={returnsHook.updateReturnItem}
              createTotal={returnsHook.returnCreateTotal}
              saving={saving}
              onSubmit={() => void returnsHook.submitCreateReturn()}
              onCancel={returnsHook.resetCreateReturnForm}
            />
          )}

          {returns.length === 0 && !returnsHook.showCreateReturn ? (
            <Card className="text-center py-10 px-4">
              <p className="m-0 text-token-sm text-neutral-500">{tr('Возвратов пока нет', "Hali qaytarishlar yo'q")}</p>
            </Card>
          ) : (
            <Table
              columns={returnsHook.returnColumns}
              data={returns}
              rowKey={(r) => r.id}
              onRowClick={(r) => returnsHook.setSelectedReturnId((prev) => (prev === r.id ? null : r.id))}
            />
          )}

          {returnsHook.selectedReturn && (
            <ReturnCard
              key={returnsHook.selectedReturn.id}
              ret={returnsHook.selectedReturn}
              saving={saving}
              onCancel={returnsHook.cancelReturn}
              onConfirm={returnsHook.confirmReturn}
              products={products}
              canEditItems={returnsHook.selectedReturn.status === 'DRAFT'}
              onAddItem={(data) => void returnsHook.addReturnItemToServer(returnsHook.selectedReturn.id, data)}
              onUpdateItem={(itemId, data) => void returnsHook.updateReturnItemOnServer(returnsHook.selectedReturn.id, itemId, data)}
              onRemoveItem={(itemId) => void returnsHook.removeReturnItemOnServer(returnsHook.selectedReturn.id, itemId)}
            />
          )}
        </>
      )}

      {tab === 'writeoffs' && (
        <>
          {writeOffsHook.showCreateWriteOff && (
            <CreateWriteOffForm
              products={products}
              purchaseOrders={receivedPos}
              reason={writeOffsHook.woReason}
              setReason={writeOffsHook.setWoReason}
              purchaseOrderId={writeOffsHook.woPurchaseOrderId}
              setPurchaseOrderId={writeOffsHook.setWoPurchaseOrderId}
              note={writeOffsHook.woNote}
              setNote={writeOffsHook.setWoNote}
              items={writeOffsHook.woItems}
              addItem={writeOffsHook.addWriteOffItem}
              removeItem={writeOffsHook.removeWriteOffItem}
              updateItem={writeOffsHook.updateWriteOffItem}
              createTotal={writeOffsHook.writeOffCreateTotal}
              saving={saving}
              onSubmit={() => void writeOffsHook.submitCreateWriteOff()}
              onCancel={writeOffsHook.resetCreateWriteOffForm}
            />
          )}

          {writeOffs.length === 0 && !writeOffsHook.showCreateWriteOff ? (
            <Card className="text-center py-10 px-4">
              <p className="m-0 text-token-sm text-neutral-500">{tr('Списаний пока нет', "Hali hisobdan chiqarishlar yo'q")}</p>
            </Card>
          ) : (
            <Table
              columns={writeOffsHook.writeOffColumns}
              data={writeOffs}
              rowKey={(w) => w.id}
              onRowClick={(w) => writeOffsHook.setSelectedWriteOffId((prev) => (prev === w.id ? null : w.id))}
            />
          )}

          {writeOffsHook.selectedWriteOff && (
            <WriteOffCard
              key={writeOffsHook.selectedWriteOff.id}
              wo={writeOffsHook.selectedWriteOff}
              saving={saving}
              onCancel={writeOffsHook.cancelWriteOff}
              onConfirm={writeOffsHook.confirmWriteOff}
              products={products}
              canEditItems={writeOffsHook.selectedWriteOff.status === 'DRAFT'}
              onAddItem={(data) => void writeOffsHook.addWriteOffItemToServer(writeOffsHook.selectedWriteOff.id, data)}
              onUpdateItem={(itemId, data) => void writeOffsHook.updateWriteOffItemOnServer(writeOffsHook.selectedWriteOff.id, itemId, data)}
              onRemoveItem={(itemId) => void writeOffsHook.removeWriteOffItemOnServer(writeOffsHook.selectedWriteOff.id, itemId)}
            />
          )}
        </>
      )}

      {tab === 'customerReturns' && (
        <>
          {customerReturnsHook.showCreateCustomerReturn && (
            <CreateCustomerReturnForm
              products={products}
              counterparties={counterparties}
              counterpartyId={customerReturnsHook.crCounterpartyId}
              setCounterpartyId={customerReturnsHook.setCrCounterpartyId}
              note={customerReturnsHook.crNote}
              setNote={customerReturnsHook.setCrNote}
              items={customerReturnsHook.crItems}
              addItem={customerReturnsHook.addCustomerReturnItem}
              removeItem={customerReturnsHook.removeCustomerReturnItem}
              updateItem={customerReturnsHook.updateCustomerReturnItem}
              createTotal={customerReturnsHook.customerReturnCreateTotal}
              saving={saving}
              onSubmit={() => void customerReturnsHook.submitCreateCustomerReturn()}
              onCancel={customerReturnsHook.resetCreateCustomerReturnForm}
            />
          )}

          {customerReturns.length === 0 && !customerReturnsHook.showCreateCustomerReturn ? (
            <Card className="text-center py-10 px-4">
              <p className="m-0 text-token-sm text-neutral-500">{tr('Возвратов пока нет', "Hali qaytarishlar yo'q")}</p>
            </Card>
          ) : (
            <Table
              columns={customerReturnsHook.customerReturnColumns}
              data={customerReturns}
              rowKey={(r) => r.id}
              onRowClick={(r) => customerReturnsHook.setSelectedCustomerReturnId((prev) => (prev === r.id ? null : r.id))}
            />
          )}

          {customerReturnsHook.selectedCustomerReturn && (
            <CustomerReturnCard
              key={customerReturnsHook.selectedCustomerReturn.id}
              ret={customerReturnsHook.selectedCustomerReturn}
              saving={saving}
              onCancel={customerReturnsHook.cancelCustomerReturn}
              onConfirm={customerReturnsHook.confirmCustomerReturn}
              products={products}
              canEditItems={customerReturnsHook.selectedCustomerReturn.status === 'DRAFT'}
              onAddItem={(data) => void customerReturnsHook.addCustomerReturnItemToServer(customerReturnsHook.selectedCustomerReturn.id, data)}
              onUpdateItem={(itemId, data) => void customerReturnsHook.updateCustomerReturnItemOnServer(customerReturnsHook.selectedCustomerReturn.id, itemId, data)}
              onRemoveItem={(itemId) => void customerReturnsHook.removeCustomerReturnItemOnServer(customerReturnsHook.selectedCustomerReturn.id, itemId)}
            />
          )}
        </>
      )}

      {tab === 'stockCounts' && (
        <>
          {stockCountsHook.showCreateStockCount && (
            <CreateStockCountForm
              note={stockCountsHook.scNote}
              setNote={stockCountsHook.setScNote}
              productCount={products.length}
              saving={saving}
              onSubmit={() => void stockCountsHook.submitCreateStockCount()}
              onCancel={stockCountsHook.resetCreateStockCountForm}
            />
          )}

          {stockCounts.length === 0 && !stockCountsHook.showCreateStockCount ? (
            <Card className="text-center py-10 px-4">
              <p className="m-0 text-token-sm text-neutral-500">{tr('Инвентаризаций пока не было', "Hali inventarizatsiya bo'lmagan")}</p>
            </Card>
          ) : (
            <Table
              columns={stockCountsHook.stockCountColumns}
              data={stockCounts}
              rowKey={(c) => c.id}
              onRowClick={(c) => stockCountsHook.setSelectedStockCountId((prev) => (prev === c.id ? null : c.id))}
            />
          )}

          {stockCountsHook.selectedStockCount && (
            <StockCountCard
              key={stockCountsHook.selectedStockCount.id}
              count={stockCountsHook.selectedStockCount}
              saving={saving}
              onCancel={stockCountsHook.cancelStockCount}
              onConfirm={stockCountsHook.confirmStockCount}
              canEdit={stockCountsHook.selectedStockCount.status === 'DRAFT'}
              onUpdateItem={(itemId, countedQty) => void stockCountsHook.updateStockCountItemOnServer(stockCountsHook.selectedStockCount.id, itemId, countedQty)}
            />
          )}
        </>
      )}

      {tab === 'priceRevisions' && (
        <>
          {priceRevisionsHook.showCreatePriceRevision && (
            <CreatePriceRevisionForm
              products={products}
              note={priceRevisionsHook.prNote}
              setNote={priceRevisionsHook.setPrNote}
              items={priceRevisionsHook.prItems}
              addItem={priceRevisionsHook.addPriceRevisionItem}
              removeItem={priceRevisionsHook.removePriceRevisionItem}
              updateItem={priceRevisionsHook.updatePriceRevisionItem}
              saving={saving}
              onSubmit={() => void priceRevisionsHook.submitCreatePriceRevision()}
              onCancel={priceRevisionsHook.resetCreatePriceRevisionForm}
            />
          )}

          {priceRevisions.length === 0 && !priceRevisionsHook.showCreatePriceRevision ? (
            <Card className="text-center py-10 px-4">
              <p className="m-0 text-token-sm text-neutral-500">{tr('Переоценок пока не было', "Hali qayta baholash bo'lmagan")}</p>
            </Card>
          ) : (
            <Table
              columns={priceRevisionsHook.priceRevisionColumns}
              data={priceRevisions}
              rowKey={(r) => r.id}
              onRowClick={(r) => priceRevisionsHook.setSelectedPriceRevisionId((prev) => (prev === r.id ? null : r.id))}
            />
          )}

          {priceRevisionsHook.selectedPriceRevision && (
            <PriceRevisionCard
              key={priceRevisionsHook.selectedPriceRevision.id}
              revision={priceRevisionsHook.selectedPriceRevision}
              saving={saving}
              onCancel={priceRevisionsHook.cancelPriceRevision}
              onConfirm={priceRevisionsHook.confirmPriceRevision}
              products={products}
              canEditItems={priceRevisionsHook.selectedPriceRevision.status === 'DRAFT'}
              onAddItem={(data) => void priceRevisionsHook.addPriceRevisionItemToServer(priceRevisionsHook.selectedPriceRevision.id, data)}
              onUpdateItem={(itemId, data) => void priceRevisionsHook.updatePriceRevisionItemOnServer(priceRevisionsHook.selectedPriceRevision.id, itemId, data)}
              onRemoveItem={(itemId) => void priceRevisionsHook.removePriceRevisionItemOnServer(priceRevisionsHook.selectedPriceRevision.id, itemId)}
            />
          )}
        </>
      )}

      {tab === 'consignmentSettlements' && (
        <>
          {consignmentHook.showCreateConsignmentSettlement && (
            <CreateConsignmentSettlementForm
              eligiblePurchaseOrders={consignmentHook.eligibleConsignmentPurchaseOrders}
              purchaseOrderId={consignmentHook.csPurchaseOrderId}
              setPurchaseOrderId={consignmentHook.setCsPurchaseOrderId}
              note={consignmentHook.csNote}
              setNote={consignmentHook.setCsNote}
              saving={saving}
              onSubmit={() => void consignmentHook.submitCreateConsignmentSettlement()}
              onCancel={consignmentHook.resetCreateConsignmentSettlementForm}
            />
          )}

          {consignmentSettlements.length === 0 && !consignmentHook.showCreateConsignmentSettlement ? (
            <Card className="text-center py-10 px-4">
              <p className="m-0 text-token-sm text-neutral-500">{tr('Отчётов о реализации пока не было', "Hali realizatsiya hisobotlari bo'lmagan")}</p>
            </Card>
          ) : (
            <Table
              columns={consignmentHook.consignmentSettlementColumns}
              data={consignmentSettlements}
              rowKey={(s) => s.id}
              onRowClick={(s) => consignmentHook.setSelectedConsignmentSettlementId((prev) => (prev === s.id ? null : s.id))}
            />
          )}

          {consignmentHook.selectedConsignmentSettlement && (
            <ConsignmentSettlementCard
              key={consignmentHook.selectedConsignmentSettlement.id}
              settlement={consignmentHook.selectedConsignmentSettlement}
              saving={saving}
              onCancel={consignmentHook.cancelConsignmentSettlement}
              onConfirm={consignmentHook.confirmConsignmentSettlement}
              canEdit={consignmentHook.selectedConsignmentSettlement.status === 'DRAFT'}
              onUpdateItem={(itemId, qtySold) => void consignmentHook.updateConsignmentSettlementItemOnServer(consignmentHook.selectedConsignmentSettlement.id, itemId, qtySold)}
            />
          )}
        </>
      )}

      {poHook.receivePo && (
        <ReceivePurchaseOrderModal
          po={poHook.receivePo}
          receiveItems={poHook.receiveItems}
          setReceiveItems={poHook.setReceiveItems}
          saving={saving}
          onClose={() => poHook.setReceivePo(null)}
          onSubmit={() => void poHook.submitReceive()}
        />
      )}
    </section>
  );
}
