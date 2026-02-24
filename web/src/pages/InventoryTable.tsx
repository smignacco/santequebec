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
  onManualEdit,
  visibleColumns,
  canEdit = true,
  columnFilters = {},
  onFilterChange,
  filterValuesByColumn = {}
}: {
  items: any[];
  onPatch: (id: string, status: string) => void;
  onBulkPatch?: (ids: string[], status: string) => void;
  onManualEdit?: (id: string, payload: { serialNumber: string; productId?: string; productDescription?: string }) => Promise<void>;
  visibleColumns?: string[];
  canEdit?: boolean;
  columnFilters?: Record<string, string>;
  onFilterChange?: (column: string, value: string) => void;
  filterValuesByColumn?: Record<string, string[]>;
}) {
  const [sortColumn, setSortColumn] = useState<string>('');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [editingId, setEditingId] = useState<string>('');
  const [manualForm, setManualForm] = useState({ serialNumber: '', productId: '', productDescription: '' });

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

  const sortedItems = useMemo(() => {
    if (!sortColumn) return items;

    return [...items].sort((a, b) => {
      const left = String(a[sortColumn] ?? '').toLowerCase();
      const right = String(b[sortColumn] ?? '').toLowerCase();
      if (left === right) return 0;
      const cmp = left > right ? 1 : -1;
      return sortDirection === 'asc' ? cmp : -cmp;
    });
  }, [items, sortColumn, sortDirection]);

  const toggleSort = (column: string) => {
    if (sortColumn !== column) {
      setSortColumn(column);
      setSortDirection('asc');
      return;
    }

    setSortDirection((currentDirection) => (currentDirection === 'asc' ? 'desc' : 'asc'));
  };

  const bulkIds = sortedItems.map((item) => item.id).filter(Boolean);
  const runBulkPatch = (status: string) => {
    if (!onBulkPatch || !bulkIds.length) return;
    onBulkPatch(bulkIds, status);
  };

  const startManualEdit = (item: any) => {
    setEditingId(item.id);
    setManualForm({
      serialNumber: item.serialNumber || item.serial || '',
      productId: item.productId || '',
      productDescription: item.productDescription || ''
    });
  };

  const cancelManualEdit = () => {
    setEditingId('');
    setManualForm({ serialNumber: '', productId: '', productDescription: '' });
  };

  const saveManualEdit = async (id: string) => {
    if (!onManualEdit || !manualForm.serialNumber.trim()) return;
    await onManualEdit(id, {
      serialNumber: manualForm.serialNumber.trim(),
      productId: manualForm.productId.trim(),
      productDescription: manualForm.productDescription.trim()
    });
    cancelManualEdit();
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
                  <select value={columnFilters[column] || ''} onChange={(event) => onFilterChange?.(column, event.target.value)}>
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
          {sortedItems.map((item) => (
            <tr key={item.id}>
              {tableColumns.map((column) => (
                <td key={`${item.id}-${column}`}>
                  {editingId === item.id && ['serialNumber', 'productId', 'productDescription'].includes(column) ? (
                    <input
                      className="input"
                      value={manualForm[column as 'serialNumber' | 'productId' | 'productDescription']}
                      onChange={(event) => setManualForm((current) => ({ ...current, [column]: event.target.value }))}
                    />
                  ) : (
                    column === 'status' ? <span className="badge">{item[column] || '-'}</span> : item[column] ?? '-'
                  )}
                </td>
              ))}
              <td>
                <div className="button-row">
                  <button className="button success" disabled={!canEdit} onClick={() => onPatch(item.id, 'CONFIRMED')}>Confirmer</button>
                  <button className="button warning" disabled={!canEdit} onClick={() => onPatch(item.id, 'NEEDS_CLARIFICATION')}>Clarifier</button>
                  <button className="button danger" disabled={!canEdit} onClick={() => onPatch(item.id, 'TO_BE_REMOVED')}>Retirer</button>
                  {item.manualEntry && canEdit && onManualEdit && (
                    editingId === item.id ? (
                      <>
                        <button className="button" type="button" onClick={() => saveManualEdit(item.id)} disabled={!manualForm.serialNumber.trim()}>Sauver</button>
                        <button className="button secondary" type="button" onClick={cancelManualEdit}>Annuler</button>
                      </>
                    ) : (
                      <button className="button secondary" type="button" onClick={() => startManualEdit(item)}>Modifier</button>
                    )
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
