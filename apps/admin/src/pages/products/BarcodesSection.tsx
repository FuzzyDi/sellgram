import React from 'react';
import { useAdminI18n } from '../../i18n';
import Button from '../../components/Button';
import Input from '../../components/Input';
import Select from '../../components/Select';
import Badge from '../../components/Badge';
import Table, { type TableColumn } from '../../components/Table';
import { useProductBarcodes } from './useProductBarcodes';
import type { NoticeTone, ProductBarcode } from './types';

const BARCODE_TYPES = ['EAN13', 'EAN8', 'CODE128', 'DATAMATRIX', 'QR'] as const;

interface BarcodesSectionProps {
  editingId: string;
  showNotice: (tone: NoticeTone, message: string) => void;
}

export default function BarcodesSection({ editingId, showNotice }: BarcodesSectionProps) {
  const { tr } = useAdminI18n();
  const {
    barcodes, loading, saving,
    newBarcode, setNewBarcode, newType, setNewType, newUnitQty, setNewUnitQty, newIsDefault, setNewIsDefault,
    addBarcode, deleteBarcode, pendingDelete, setPendingDelete,
  } = useProductBarcodes(editingId, showNotice);

  const columns: TableColumn<ProductBarcode>[] = [
    { key: 'barcode', header: tr('Штрихкод', 'Shtrix-kod'), render: (b) => <span className="font-mono text-neutral-800">{b.barcode}</span> },
    { key: 'type', header: tr('Тип', 'Turi'), render: (b) => <Badge>{b.type}</Badge> },
    {
      key: 'unitQty',
      header: tr('Кол-во в упаковке', 'Qadoqdagi soni'),
      render: (b) => b.unitQty != null ? Number(b.unitQty).toString() : '1',
    },
    {
      key: 'isDefault',
      header: '',
      render: (b) => b.isDefault ? <Badge variant="success">{tr('По умолчанию', "Standart")}</Badge> : null,
    },
    {
      key: 'actions',
      header: '',
      render: (b) => (
        pendingDelete === b.id ? (
          <div className="flex gap-1.5 items-center">
            <span className="text-token-xs text-neutral-600">{tr('Удалить?', "O'chirilsinmi?")}</span>
            <Button variant="danger" size="sm" type="button" onClick={() => void deleteBarcode(b.id)}>{tr('Да', 'Ha')}</Button>
            <Button variant="ghost" size="sm" type="button" onClick={() => setPendingDelete(null)}>{tr('Нет', "Yo'q")}</Button>
          </div>
        ) : (
          <Button variant="danger" size="sm" type="button" onClick={() => setPendingDelete(b.id)}>{tr('Удалить', "O'chirish")}</Button>
        )
      ),
    },
  ];

  return (
    <div className="border-t border-neutral-200 pt-4">
      <label className="text-token-sm font-semibold text-neutral-800 block mb-2.5">
        {tr('Штрихкоды', 'Shtrix-kodlar')}
      </label>

      {barcodes.length > 0 && (
        <div className="mb-3 border border-neutral-200 rounded-token-lg overflow-hidden">
          <Table columns={columns} data={barcodes} rowKey={(b) => b.id} loading={loading} />
        </div>
      )}

      <div className="flex gap-2 items-end flex-wrap">
        <div className="flex-[2] min-w-[160px]">
          <Input
            label={tr('Штрихкод', 'Shtrix-kod')}
            value={newBarcode}
            onChange={(e) => setNewBarcode(e.target.value)}
            placeholder="4780000000000"
          />
        </div>
        <div className="min-w-[130px]">
          <Select label={tr('Тип', 'Turi')} value={newType} onChange={(e) => setNewType(e.target.value)}>
            {BARCODE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </Select>
        </div>
        <div className="w-[110px]">
          <Input
            type="number"
            label={tr('Кол-во', 'Soni')}
            value={newUnitQty}
            onChange={(e) => setNewUnitQty(e.target.value)}
            placeholder="1"
          />
        </div>
        <label className="flex items-center gap-1.5 text-token-sm text-neutral-700 pb-2.5">
          <input type="checkbox" className="h-4 w-4 accent-accent-600" checked={newIsDefault} onChange={(e) => setNewIsDefault(e.target.checked)} />
          {tr('По умолчанию', 'Standart')}
        </label>
        <Button
          variant="primary" size="md" type="button" className="flex-shrink-0"
          disabled={!newBarcode.trim() || saving}
          onClick={() => void addBarcode()}
        >
          {saving ? '...' : `+ ${tr('Штрихкод', 'Shtrix-kod')}`}
        </Button>
      </div>
    </div>
  );
}
