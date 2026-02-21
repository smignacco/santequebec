import { useMemo, useState } from 'react';

const sortableColumns = [
  { key: 'assetTag', label: 'Asset' },
  { key: 'serial', label: 'Serial' },
  { key: 'status', label: 'Status' }
] as const;

export function InventoryTable({ items, onPatch }: { items: any[]; onPatch: (id: string, status: string) => void }) {
  const [activeFilter, setActiveFilter] = useState<string>('');

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
            <th>#</th>
            {sortableColumns.map((column) => (
              <th key={column.key}>
                <button className="header-filter" type="button" onClick={() => toggleFilter(column.key)}>
                  {column.label}
                  {column.key === 'status' && activeFilter ? ` (${activeFilter})` : ''}
                </button>
              </th>
            ))}
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((i) => (
            <tr key={i.id}>
              <td>{i.rowNumber}</td>
              <td>{i.assetTag}</td>
              <td>{i.serial}</td>
              <td><span className="badge">{i.status}</span></td>
              <td>
                <div className="button-row">
                  <button className="button success" onClick={() => onPatch(i.id, 'CONFIRMED')}>Confirmer</button>
                  <button className="button warning" onClick={() => onPatch(i.id, 'NEEDS_CLARIFICATION')}>Clarifier</button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
