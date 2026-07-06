import React from 'react';

// Reusable table shell (docs/ADMIN_REDESIGN.md §5), modeled on the real
// hand-rolled markup repeated across Products.tsx/Customers.tsx today:
// a bordered container, <thead>/<tbody>, a single full-width row for the
// empty state, and a separate non-table skeleton for loading (those
// pages don't render skeleton <tr>s — they render stacked placeholder
// bars instead, so this component follows the same shape rather than
// inventing a fake-table-row skeleton that has no current precedent).
export interface TableColumn<T> {
  key: string;
  header: React.ReactNode;
  render: (row: T) => React.ReactNode;
  width?: number | string;
  align?: 'left' | 'right' | 'center';
  // No sorting logic is wired up in this step — Products.tsx/Orders.tsx/
  // Customers.tsx don't sort columns today either. This flag plus
  // `sortKey`/`sortDirection`/`onSort` below exist so a future page can
  // turn a column sortable without the column API itself having to change.
  sortable?: boolean;
}

export interface TableProps<T> {
  columns: TableColumn<T>[];
  data: T[];
  rowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
  loading?: boolean;
  emptyMessage?: React.ReactNode;
  sortKey?: string;
  sortDirection?: 'asc' | 'desc';
  onSort?: (key: string) => void;
}

export default function Table<T,>({
  columns, data, rowKey, onRowClick, loading, emptyMessage, sortKey, sortDirection, onSort,
}: TableProps<T>) {
  if (loading) {
    return (
      <div className="border border-neutral-200 rounded-token-lg overflow-hidden divide-y divide-neutral-200">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="p-3 flex gap-4">
            {columns.map((col) => (
              <div
                key={col.key}
                className="h-4 rounded-token-sm bg-neutral-100 animate-pulse"
                style={{ width: col.width ?? 120 }}
              />
            ))}
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="border border-neutral-200 rounded-token-lg overflow-hidden">
      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b border-neutral-200">
            {columns.map((col) => {
              const sortable = col.sortable && onSort;
              return (
                <th
                  key={col.key}
                  onClick={sortable ? () => onSort!(col.key) : undefined}
                  className={[
                    'text-token-xs font-semibold text-neutral-500 uppercase tracking-wide px-3 py-2.5',
                    sortable ? 'cursor-pointer select-none' : '',
                  ].filter(Boolean).join(' ')}
                  style={{ width: col.width, textAlign: col.align ?? 'left' }}
                >
                  <span className="inline-flex items-center gap-1">
                    {col.header}
                    {col.sortable && sortKey === col.key && (
                      <span aria-hidden="true">{sortDirection === 'desc' ? '↓' : '↑'}</span>
                    )}
                  </span>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {data.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="text-center text-token-sm text-neutral-500 px-3 py-8">
                {emptyMessage ?? 'No data'}
              </td>
            </tr>
          ) : (
            data.map((row) => (
              <tr
                key={rowKey(row)}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={[
                  'border-b border-neutral-200 last:border-0',
                  onRowClick ? 'cursor-pointer hover:bg-neutral-50' : '',
                ].filter(Boolean).join(' ')}
              >
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className="px-3 py-3 text-token-sm text-neutral-700"
                    style={{ textAlign: col.align ?? 'left' }}
                  >
                    {col.render(row)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
