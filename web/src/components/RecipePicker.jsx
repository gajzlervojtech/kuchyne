import { useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import { Icon } from '../icons';
import { Sheet, Thumb } from './ui';

// Výběr receptu do plánu. preferIds = recepty zobrazené nahoře (např. víkendová jídla).
export default function RecipePicker({ open, onClose, onPick, title = 'Vybrat recept', allowClear, preferIds, preferLabel }) {
  const [all, setAll] = useState([]);
  const [q, setQ] = useState('');

  useEffect(() => {
    if (!open) return;
    setQ('');
    api.get('/recipes').then((d) => setAll(d.recipes)).catch(() => {});
  }, [open]);

  const list = useMemo(() => {
    const k = q.trim().toLocaleLowerCase('cs');
    return k ? all.filter((r) => r.name.toLocaleLowerCase('cs').includes(k)) : all;
  }, [all, q]);

  const preferred = preferIds ? list.filter((r) => preferIds.includes(r.id)) : [];
  const rest = preferIds ? list.filter((r) => !preferIds.includes(r.id)) : list;

  const Row = (r) => (
    <button key={r.id} className="pick-row" onClick={() => onPick(r)}>
      <Thumb src={r.thumb} className="thumb-sm" />
      <span className="pick-name">{r.name}</span>
      {r.tags.length > 0 && <span className="chip chip-muted">{r.tags[0]}</span>}
    </button>
  );

  return (
    <Sheet open={open} onClose={onClose} title={title}
      footer={allowClear && <button className="btn btn-outline btn-block" onClick={() => onPick(null)}><Icon name="trash" size={18} />Nechat prázdné</button>}>
      <label className="search">
        <Icon name="search" size={18} />
        <input type="search" placeholder="Hledat recept…" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
      </label>
      {preferred.length > 0 && <><div className="list-label">{preferLabel}</div>{preferred.map(Row)}</>}
      {preferred.length > 0 && rest.length > 0 && <div className="list-label">Ostatní recepty</div>}
      {rest.map(Row)}
      {all.length === 0 && <p className="muted pad">Zatím žádné recepty. Nejdřív nějaký přidejte v Receptech.</p>}
    </Sheet>
  );
}
