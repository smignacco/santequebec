import { useMemo, useState } from 'react';

const technicalColumns = new Set(['id', 'inventoryFileId', 'updatedAt']);

const prettify = (column: string) => {
  if (!column) return '';
  return column
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/_/g, ' ')
    .replace(/^./, (char) => char.toUpperCase());
};

export function InventoryTable({
  items,
  onPatch,
  visibleColumns,
  canEdit = true
}: {
  items: any[];
  onPatch: (id: string, status: string) => void;
  visibleColumns?: string[];
  canEdit?: boolean;
}) {
  const [activeFilter, setActiveFilter] = useState<string>('');

  const tableColumns = useMemo(() => {
    if (visibleColumns?.length) {
      return visibleColumns.filter((column) => !technicalColumns.has(column));
    }

    if (!items.length) return ['rowNumber', 'assetTag', 'serial', 'status'];

    const columns = new Set<string>();
    items.forEach((item) => {
      Object.keys(item).forEach((key) => {
        if (!technicalColumns.has(key)) {
          columns.add(key);
        }
      });
    });

    return Array.from(columns);
  }, [items, visibleColumns]);

  const filtered = useMemo(() => {
    if (!activeFilter) return items;
    return items.filter((item) => String(item.status || '').toUpperCase() === activeFilter);
  }, [items, activeFilter]);

  const toggleFilter = (column: string) => {
    if (column !== 'status') return;
    setActiveFilter((prev) => (prev === 'PENDING' ? 'CONFIRMED' : prev === 'CONFIRMED' ? 'NEEDS_CLARIFICATION' : prev === 'NEEDS_CLARIFICATION' ? '' : 'PENDING'));
  };

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            {tableColumns.map((column) => (
              <th key={column}>
                <button className="header-filter" type="button" onClick={() => toggleFilter(column)}>
                  {prettify(column)}
                  {column === 'status' && activeFilter ? ` (${activeFilter})` : ''}
                </button>
              </th>
            ))}
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((item) => (
            <tr key={item.id}>
              {tableColumns.map((column) => (
                <td key={`${item.id}-${column}`}>
                  {column === 'status' ? <span className="badge">{item[column] || '-'}</span> : item[column] ?? '-'}
                </td>
              ))}
              <td>
                <div className="button-row">
                  <button className="button success" disabled={!canEdit} onClick={() => onPatch(item.id, 'CONFIRMED')}>Confirmer</button>
                  <button className="button warning" disabled={!canEdit} onClick={() => onPatch(item.id, 'NEEDS_CLARIFICATION')}>Clarifier</button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
