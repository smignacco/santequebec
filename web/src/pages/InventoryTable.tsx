export function InventoryTable({ items, onPatch }: { items: any[]; onPatch: (id: string, status: string) => void }) {
  return <table><thead><tr><th>#</th><th>Asset</th><th>Serial</th><th>Status</th><th>Action</th></tr></thead><tbody>{items.map((i) => <tr key={i.id}><td>{i.rowNumber}</td><td>{i.assetTag}</td><td>{i.serial}</td><td>{i.status}</td><td><button onClick={() => onPatch(i.id, 'CONFIRMED')}>Confirmer</button><button onClick={() => onPatch(i.id, 'NEEDS_CLARIFICATION')}>Clarifier</button></td></tr>)}</tbody></table>;
}
