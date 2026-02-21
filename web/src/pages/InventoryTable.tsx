export function InventoryTable({ items, onPatch }: { items: any[]; onPatch: (id: string, status: string) => void }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>Asset</th>
            <th>Serial</th>
            <th>Status</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          {items.map((i) => (
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
