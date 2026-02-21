import { useMemo, useState } from 'react';

const technicalColumns = new Set(['id', 'inventoryFileId', 'updatedAt']);
const defaultVisibleColumns = ['rowNumber', 'serialNumber', 'productId', 'productDescription', 'productType', 'architecture', 'status'];

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
  onBulkPatch,
  visibleColumns,
  canEdit = true
}: {
  items: any[];
  onPatch: (id: string, status: string) => void;
  onBulkPatch?: (ids: string[], status: string) => void;
  visibleColumns?: string[];
  canEdit?: boolean;
}) {
  const [columnFilters, setColumnFilters] = useState<Record<string, string>>({});
  const [sortColumn, setSortColumn] = useState<string>('');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  const tableColumns = useMemo(() => {
    if (visibleColumns?.length) {
      return visibleColumns.filter((column) => !technicalColumns.has(column));
    }

    if (!items.length) return defaultVisibleColumns;

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

  const filterValuesByColumn = useMemo(() => {
    const result: Record<string, string[]> = {};
    tableColumns.forEach((column) => {
      const values = Array.from(new Set(items.map((item) => String(item[column] ?? '').trim()).filter(Boolean)));
      result[column] = values;
    });
    return result;
  }, [items, tableColumns]);

  const sortedAndFilteredItems = useMemo(() => {
    const filteredItems = items.filter((item) => Object.entries(columnFilters).every(([column, value]) => String(item[column] ?? '') === value));
    if (!sortColumn) return filteredItems;

    return [...filteredItems].sort((a, b) => {
      const left = String(a[sortColumn] ?? '').toLowerCase();
      const right = String(b[sortColumn] ?? '').toLowerCase();
      if (left === right) return 0;
      const cmp = left > right ? 1 : -1;
      return sortDirection === 'asc' ? cmp : -cmp;
    });
  }, [items, columnFilters, sortColumn, sortDirection]);

  const toggleSort = (column: string) => {
    if (sortColumn !== column) {
      setSortColumn(column);
      setSortDirection('asc');
      return;
    }

    setSortDirection((currentDirection) => (currentDirection === 'asc' ? 'desc' : 'asc'));
  };

  const updateFilter = (column: string, value: string) => {
    setColumnFilters((currentFilters) => {
      if (!value) {
        const nextFilters = { ...currentFilters };
        delete nextFilters[column];
        return nextFilters;
      }

      return { ...currentFilters, [column]: value };
    });
  };

  const bulkIds = sortedAndFilteredItems.map((item) => item.id).filter(Boolean);
  const runBulkPatch = (status: string) => {
    if (!onBulkPatch || !bulkIds.length) return;
    onBulkPatch(bulkIds, status);
  };

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            {tableColumns.map((column) => (
              <th key={column}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                  <button className="header-filter" type="button" onClick={() => toggleSort(column)}>
                    {prettify(column)}
                    {sortColumn === column ? ` (${sortDirection === 'asc' ? '↑' : '↓'})` : ''}
                  </button>
                  <select value={columnFilters[column] || ''} onChange={(event) => updateFilter(column, event.target.value)}>
                    <option value="">Tous</option>
                    {filterValuesByColumn[column]?.map((value) => (
                      <option key={`${column}-${value}`} value={value}>{value}</option>
                    ))}
                  </select>
                </div>
              </th>
            ))}
            <th>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                <span>Action</span>
                <div className="button-row">
                  <button className="button success" type="button" disabled={!canEdit || !bulkIds.length} onClick={() => runBulkPatch('CONFIRMED')}>Confirmer</button>
                  <button className="button warning" type="button" disabled={!canEdit || !bulkIds.length} onClick={() => runBulkPatch('NEEDS_CLARIFICATION')}>Clarifier</button>
                  <button className="button danger" type="button" disabled={!canEdit || !bulkIds.length} onClick={() => runBulkPatch('TO_BE_REMOVED')}>Retirer</button>
                </div>
              </div>
            </th>
          </tr>
        </thead>
        <tbody>
          {sortedAndFilteredItems.map((item) => (
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
                  <button className="button danger" disabled={!canEdit} onClick={() => onPatch(item.id, 'TO_BE_REMOVED')}>Retirer</button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
