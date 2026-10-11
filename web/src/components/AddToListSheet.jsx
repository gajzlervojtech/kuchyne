import { useEffect, useState } from 'react';
import { api, plural } from '../api';
import { useApp } from '../store';
import { Checkbox, Sheet } from './ui';

// Náhled před přidáním do nákupu. source = { recipes: [{id, servings}] } | { week: n } | { weekend: true }
export default function AddToListSheet({ open, onClose, source, title, subtitle }) {
  const { setShopping, notify } = useApp();
  const [rows, setRows] = useState(null);
  const [include, setInclude] = useState(new Set());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setRows(null);
    api.post('/shopping/preview', source).then((r) => {
      setRows(r);
      setInclude(new Set(r.filter((x) => x.include).map((x) => x.ingredient_id)));
    }).catch((e) => notify(e.message, 'err'));
  }, [open, JSON.stringify(source)]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = (id) => setInclude((s) => {
    const n = new Set(s);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });

  const selected = rows ? rows.filter((r) => include.has(r.ingredient_id)) : [];
  const merging = selected.filter((r) => r.status === 'merge').length;

  const submit = async () => {
    setBusy(true);
    try {
      const res = await api.post('/shopping/add-recipes', { ...source, include: [...include] });
      setShopping(res);
      notify(`Přidáno do nákupu: ${res.added} ${plural(res.added, 'položka', 'položky', 'položek')}`);
      onClose();
    } catch (e) { notify(e.message, 'err'); } finally { setBusy(false); }
  };

  return (
    <Sheet open={open} onClose={onClose} title={title || 'Do nákupu'}
      footer={rows && rows.length > 0 && (
        <button className="btn btn-primary btn-block" disabled={busy || !selected.length} onClick={submit}>
          Přidat {selected.length} {plural(selected.length, 'položku', 'položky', 'položek')}
          {merging > 0 && ` · ${merging} se sloučí`}
        </button>
      )}>
      {subtitle && <p className="muted small" style={{ marginTop: 0 }}>{subtitle} Co už v seznamu je, se přičte.</p>}
      {!rows && <p className="muted pad">Načítám…</p>}
      {rows && rows.length === 0 && <p className="muted pad">Tady nejsou žádné suroviny k přidání.</p>}
      {rows && rows.map((r) => {
        const on = include.has(r.ingredient_id);
        let badge; let cls;
        if (!on) { badge = r.pantry ? 'máme doma' : 'nepřidávat'; cls = 'badge-muted'; }
        else if (r.status === 'merge') { badge = `${r.existing} → ${r.result}`; cls = 'badge-merge'; }
        else { badge = 'nové'; cls = 'badge-new'; }
        return (
          <button key={r.ingredient_id} className={`check-row ${on ? '' : 'off'}`} onClick={() => toggle(r.ingredient_id)}>
            <Checkbox checked={on} />
            <span className="check-main">
              <span className="check-name">{r.name} <span className="muted">{r.qty}</span></span>
              <span className="check-sub">{r.category}{r.recipes.length > 1 ? ` · ${r.recipes.length} recepty` : ''}</span>
            </span>
            <span className={`pill ${cls}`}>{badge}</span>
          </button>
        );
      })}
    </Sheet>
  );
}
