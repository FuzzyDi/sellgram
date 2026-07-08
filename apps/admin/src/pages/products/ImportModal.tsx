import React, { useRef, useState } from 'react';
import { adminApi } from '../../api/store-admin-client';
import { useAdminI18n } from '../../i18n';
import Card from '../../components/Card';
import Button from '../../components/Button';
import Badge from '../../components/Badge';

export default function ImportModal({ onClose, onImported }: { onClose: () => void; onImported: () => void }) {
  const { tr } = useAdminI18n();
  const [step, setStep] = useState<'upload' | 'preview' | 'done'>('upload');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<any>(null);
  const [result, setResult] = useState<any>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = async (f: File) => {
    setFile(f);
    setError('');
    setLoading(true);
    try {
      const data = await adminApi.importProductsPreview(f);
      setPreview(data);
      setStep('preview');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleApply = async () => {
    if (!file) return;
    setLoading(true);
    setError('');
    try {
      const data = await adminApi.importProductsApply(file);
      setResult(data);
      setStep('done');
      onImported();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const validRows = preview?.rows?.filter((r: any) => r.errors.length === 0) ?? [];
  const invalidRows = preview?.rows?.filter((r: any) => r.errors.length > 0) ?? [];

  return (
    <div className="fixed inset-0 bg-black/45 flex items-center justify-center z-50 p-4">
      <Card className="w-full max-w-[780px] max-h-[90vh] overflow-y-auto flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h3 className="m-0 text-token-xl font-semibold text-neutral-800">{tr('Импорт товаров', 'Mahsulotlarni import qilish')}</h3>
          <button onClick={onClose} className="bg-transparent border-none cursor-pointer text-token-xl text-neutral-500 leading-none">×</button>
        </div>

        {error && (
          <div className="bg-danger/5 text-danger border border-danger/30 rounded-token-md px-3 py-2.5 text-token-sm">
            {error}
          </div>
        )}

        {step === 'upload' && (
          <div className="flex flex-col gap-3.5">
            <Card className="bg-success/5 border-success/30">
              <p className="m-0 font-semibold text-token-sm text-neutral-800">{tr('Формат файла', 'Fayl formati')}</p>
              <p className="mt-1.5 mb-0 text-token-sm text-success">
                {tr('Поддерживаются .xlsx, .xls, .csv. Обязательные колонки:', 'Qo\'llab-quvvatlanadi .xlsx, .xls, .csv. Majburiy ustunlar:')}
                {' '}<strong>name, price</strong>.
                {' '}{tr('Опциональные:', 'Ixtiyoriy:')} sku, description, category, stockQty, costPrice, unit, isActive
              </p>
            </Card>

            <div className="flex gap-2.5">
              <Button
                variant="ghost"
                size="md"
                type="button"
                onClick={() => adminApi.getImportTemplate().catch(() => {})}
              >
                ↓ {tr('Скачать шаблон CSV', 'CSV shablonni yuklab olish')}
              </Button>
            </div>

            <label className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-neutral-300 rounded-token-lg px-4 py-8 cursor-pointer bg-neutral-50">
              <span className="text-token-2xl">📂</span>
              <span className="font-semibold text-token-lg text-neutral-800">{loading ? tr('Загрузка...', 'Yuklanmoqda...') : tr('Выбрать файл', 'Fayl tanlash')}</span>
              <span className="text-token-xs text-neutral-500">.xlsx, .xls, .csv — до 5 МБ</span>
              <input
                ref={fileRef}
                type="file"
                accept=".xlsx,.xls,.csv,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                className="hidden"
                disabled={loading}
                onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
              />
            </label>
          </div>
        )}

        {step === 'preview' && preview && (
          <div className="flex flex-col gap-3.5">
            <div className="flex gap-2.5 flex-wrap">
              <Card className="flex-1 min-w-[100px] text-center py-2.5 px-2">
                <div className="text-token-xl font-semibold text-neutral-800">{preview.summary.total}</div>
                <div className="text-token-xs text-neutral-500">{tr('Строк', 'Qator')}</div>
              </Card>
              <Card className="flex-1 min-w-[100px] text-center py-2.5 px-2 bg-success/5 border-success/30">
                <div className="text-token-xl font-semibold text-success">{preview.summary.valid}</div>
                <div className="text-token-xs text-success">{tr('Готово к импорту', 'Import uchun tayyor')}</div>
              </Card>
              {preview.summary.errors > 0 && (
                <Card className="flex-1 min-w-[100px] text-center py-2.5 px-2 bg-danger/5 border-danger/30">
                  <div className="text-token-xl font-semibold text-danger">{preview.summary.errors}</div>
                  <div className="text-token-xs text-danger">{tr('Ошибок', 'Xatolar')}</div>
                </Card>
              )}
            </div>

            <div className="max-h-80 overflow-y-auto rounded-token-md border border-neutral-200">
              <table className="w-full border-collapse text-token-xs">
                <thead>
                  <tr className="border-b border-neutral-200">
                    <th className="text-left font-semibold text-neutral-500 px-2.5 py-2">#</th>
                    <th className="text-left font-semibold text-neutral-500 px-2.5 py-2">{tr('Название', 'Nomi')}</th>
                    <th className="text-left font-semibold text-neutral-500 px-2.5 py-2">{tr('Цена', 'Narx')}</th>
                    <th className="text-left font-semibold text-neutral-500 px-2.5 py-2">SKU</th>
                    <th className="text-left font-semibold text-neutral-500 px-2.5 py-2">{tr('Категория', 'Toifa')}</th>
                    <th className="text-left font-semibold text-neutral-500 px-2.5 py-2">{tr('Остаток', 'Qoldiq')}</th>
                    <th className="text-left font-semibold text-neutral-500 px-2.5 py-2">{tr('Действие', 'Amal')}</th>
                    <th className="text-left font-semibold text-neutral-500 px-2.5 py-2">{tr('Статус', 'Holat')}</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.map((row: any) => (
                    <tr key={row.row} className={`border-b border-neutral-100 last:border-0 ${row.errors.length > 0 ? 'bg-danger/5' : ''}`}>
                      <td className="px-2.5 py-2 text-neutral-500">{row.row}</td>
                      <td className="px-2.5 py-2 font-medium text-neutral-800">{row.name || '—'}</td>
                      <td className="px-2.5 py-2">{row.price !== null ? `${Number(row.price).toLocaleString()} UZS` : '—'}</td>
                      <td className="px-2.5 py-2">{row.sku || '—'}</td>
                      <td className="px-2.5 py-2">{row.category || '—'}</td>
                      <td className="px-2.5 py-2">{row.stockQty}</td>
                      <td className="px-2.5 py-2">
                        <Badge variant={row.action === 'update' ? 'info' : 'success'}>
                          {row.action === 'update' ? tr('Обновить', 'Yangilash') : tr('Создать', 'Yaratish')}
                        </Badge>
                      </td>
                      <td className="px-2.5 py-2">
                        {row.errors.length > 0 ? (
                          <span title={row.errors.join(', ')} className="text-danger cursor-help">
                            ⚠ {row.errors[0]}{row.errors.length > 1 ? ` +${row.errors.length - 1}` : ''}
                          </span>
                        ) : (
                          <span className="text-success">✓</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex gap-2.5">
              {validRows.length > 0 && (
                <Button variant="primary" size="md" type="button" disabled={loading} onClick={handleApply}>
                  {loading ? tr('Импорт...', 'Import...') : tr(`Импортировать ${validRows.length} товар(ов)`, `${validRows.length} ta mahsulot import qilish`)}
                </Button>
              )}
              <Button variant="ghost" size="md" type="button" onClick={() => { setStep('upload'); setPreview(null); setFile(null); if (fileRef.current) fileRef.current.value = ''; }}>
                {tr('Другой файл', 'Boshqa fayl')}
              </Button>
              <Button variant="ghost" size="md" type="button" onClick={onClose}>{tr('Отмена', 'Bekor qilish')}</Button>
            </div>
          </div>
        )}

        {step === 'done' && result && (
          <div className="flex flex-col gap-3.5">
            <div className="flex gap-2.5 flex-wrap">
              <Card className="flex-1 text-center py-3.5 px-2 bg-success/5 border-success/30">
                <div className="text-token-2xl font-semibold text-success">{result.summary.created}</div>
                <div className="text-token-sm text-success">{tr('Создано', 'Yaratildi')}</div>
              </Card>
              <Card className="flex-1 text-center py-3.5 px-2 bg-accent-600/5 border-accent-600/30">
                <div className="text-token-2xl font-semibold text-accent-600">{result.summary.updated}</div>
                <div className="text-token-sm text-accent-600">{tr('Обновлено', 'Yangilandi')}</div>
              </Card>
              {result.summary.skipped > 0 && (
                <Card className="flex-1 text-center py-3.5 px-2">
                  <div className="text-token-2xl font-semibold text-neutral-800">{result.summary.skipped}</div>
                  <div className="text-token-sm text-neutral-500">{tr('Пропущено', 'O\'tkazib yuborildi')}</div>
                </Card>
              )}
            </div>
            {result.summary.applyErrors?.length > 0 && (
              <div className="bg-danger/5 rounded-token-md px-3 py-2.5 text-token-sm text-danger">
                {result.summary.applyErrors.map((e: any) => <div key={e.row}>Строка {e.row}: {e.error}</div>)}
              </div>
            )}
            <Button variant="primary" size="md" type="button" onClick={onClose}>{tr('Готово', 'Tayyor')}</Button>
          </div>
        )}
      </Card>
    </div>
  );
}
