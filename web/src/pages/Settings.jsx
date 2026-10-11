import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import { Icon } from '../icons';
import { useApp } from '../store';
import { PageHead, Sheet } from '../components/ui';
import IngredientInput from '../components/IngredientInput';

function Backup() {
  const { notify } = useApp();
  const [s, setS] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { api.get('/backup').then(setS).catch(() => {}); }, []);
  if (!s) return null;
  const fmt = (d) => (d ? new Date(d).toLocaleDateString('cs-CZ', { day: 'numeric', month: 'long', year: 'numeric' }) : '–');
  return (
    <section className="card set-card">
      <h2>Záloha</h2>
      {!s.enabled && <p className="muted">Záloha není nastavená. V <code>compose.yaml</code> připojte složku na RAID 1 jako <code>/backup</code>.</p>}
      {s.enabled && (
        <>
          <p>Automaticky každých {s.every_days} dní do <code>{s.dir}</code>, drží se posledních {s.keep} záloh.</p>
          <p className="muted">Poslední: <strong>{fmt(s.last)}</strong> · další: {fmt(s.next)}</p>
          <button className="btn btn-outline" disabled={busy} onClick={async () => {
            setBusy(true);
            try { setS(await api.post('/backup')); notify('Záloha hotová'); } catch (e) { notify(e.message, 'err'); } finally { setBusy(false); }
          }}>{busy ? 'Zálohuji…' : 'Zálohovat teď'}</button>
        </>
      )}
    </section>
  );
}

function Ingredients() {
  const { meta, notify } = useApp();
  const [all, setAll] = useState([]);
  const [q, setQ] = useState('');
  const [merge, setMerge] = useState(null);
  const [target, setTarget] = useState({ ingredient_id: null, name: '' });
  const load = useCallback(() => api.get('/ingredients/all').then(setAll).catch(() => {}), []);
  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    const k = q.trim().toLocaleLowerCase('cs');
    return k ? all.filter((i) => i.name.toLocaleLowerCase('cs').includes(k)) : all;
  }, [all, q]);
  const groups = useMemo(() => {
    const m = new Map();
    for (const i of filtered) { if (!m.has(i.category)) m.set(i.category, []); m.get(i.category).push(i); }
    return [...m.entries()];
  }, [filtered]);

  const patch = async (id, body) => {
    try { await api.patch(`/ingredients/${id}`, body); load(); } catch (e) { notify(e.message, 'err'); }
  };

  return (
    <section className="card set-card">
      <h2>Suroviny a kategorie</h2>
      <p className="muted small">Každá surovina je tu jen jednou. Podle kategorie se řadí v nákupu. „Doma“ = při přidání receptu do nákupu se nepředvolí (koření, sůl, olej…).</p>
      <label className="search"><Icon name="search" size={18} />
        <input type="search" placeholder={`Hledat mezi ${all.length} surovinami`} value={q} onChange={(e) => setQ(e.target.value)} />
      </label>
      {groups.map(([cat, items]) => (
        <div key={cat} className="set-group">
          <h3 className="shop-cat">{cat} · {items.length}</h3>
          {items.map((i) => (
            <div key={i.id} className="set-row">
              <span className="set-name">{i.name}{i.used > 0 && <span className="muted small"> · {i.used}× v receptech</span>}</span>
              <select value={i.category_id} onChange={(e) => patch(i.id, { category_id: Number(e.target.value) })} aria-label={`Kategorie ${i.name}`}>
                {meta.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <label className="set-pantry"><input type="checkbox" checked={i.pantry} onChange={(e) => patch(i.id, { pantry: e.target.checked })} /> doma</label>
              <button className="icon-btn icon-btn-sm" onClick={() => { setMerge(i); setTarget({ ingredient_id: null, name: '' }); }} aria-label={`Sloučit nebo smazat ${i.name}`}><Icon name="more" /></button>
            </div>
          ))}
        </div>
      ))}
      <Sheet open={!!merge} onClose={() => setMerge(null)} title={merge?.name || ''}>
        {merge && (
          <>
            <p className="small">Je to duplicita? Sloučte ji do jiné suroviny – recepty i nákup se přepojí.</p>
            <div className="field"><span>Sloučit do</span>
              <IngredientInput value={target} onChange={setTarget} placeholder="Začněte psát…" />
            </div>
            <button className="btn btn-primary btn-block" disabled={!target.ingredient_id || target.ingredient_id === merge.id}
              onClick={async () => { await api.post(`/ingredients/${merge.id}/merge`, { into: target.ingredient_id }); notify('Sloučeno'); setMerge(null); load(); }}>
              Sloučit „{merge.name}“ → „{target.name || '…'}“
            </button>
            <button className="btn btn-outline btn-block danger" disabled={merge.used > 0}
              onClick={async () => { try { await api.del(`/ingredients/${merge.id}`); setMerge(null); load(); } catch (e) { notify(e.message, 'err'); } }}>
              <Icon name="trash" size={18} /> Smazat {merge.used > 0 ? '(používá se v receptu)' : ''}
            </button>
          </>
        )}
      </Sheet>
    </section>
  );
}

export default function Settings() {
  return (
    <div className="page page-settings">
      <PageHead title="Nastavení" />
      <div className="pad-x set-wrap">
        <Backup />
        <Ingredients />
      </div>
    </div>
  );
}
