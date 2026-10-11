import { useEffect, useRef, useState } from 'react';
import { api, plural } from '../api';
import { Icon } from '../icons';
import { useApp } from '../store';
import { Checkbox, Sheet } from './ui';

function QuickAdd() {
  const { setShopping, notify } = useApp();
  const [text, setText] = useState('');
  const [sugg, setSugg] = useState([]);
  const timer = useRef();

  // šeptač: poslední slovo(a) bez čísla a jednotky
  const nameQuery = text.replace(/^\s*\d+(?:[.,]\d+)?\s*(g|kg|dag|ml|dl|l|ks|lžíce|lžička|balení|plech\.?)?\s+/i, '').trim();

  useEffect(() => {
    clearTimeout(timer.current);
    if (nameQuery.length < 2) { setSugg([]); return undefined; }
    timer.current = setTimeout(() => {
      api.get(`/ingredients?q=${encodeURIComponent(nameQuery)}`).then((r) => setSugg(r.slice(0, 4))).catch(() => {});
    }, 150);
    return () => clearTimeout(timer.current);
  }, [nameQuery]);

  const submit = async (e) => {
    e?.preventDefault();
    if (!text.trim()) return;
    try {
      setShopping(await api.post('/shopping', { text }));
      setText(''); setSugg([]);
    } catch (err) { notify(err.message, 'err'); }
  };

  const pick = (name) => {
    const prefix = text.slice(0, text.length - nameQuery.length);
    setText(`${prefix}${name}`);
    setSugg([]);
  };

  return (
    <form className="quick-add" onSubmit={submit}>
      <div className="quick-row">
        <label className="field-inline">
          <span className="sr-only">Nová položka</span>
          <input type="text" value={text} onChange={(e) => setText(e.target.value)} placeholder="Přidat… (např. 2 l mléka)" autoComplete="off" />
        </label>
        <button className="btn btn-primary" type="submit">Přidat</button>
      </div>
      {sugg.length > 0 && !sugg.some((s) => s.name.toLocaleLowerCase('cs') === nameQuery.toLocaleLowerCase('cs')) && (
        <div className="sugg">
          {sugg.map((s) => (
            <button type="button" key={s.id} className="chip" onClick={() => pick(s.name)}>{s.name}</button>
          ))}
        </div>
      )}
    </form>
  );
}

export default function ShoppingList({ compact }) {
  const { shopping, setShopping, meta, notify } = useApp();
  const [menu, setMenu] = useState(null);
  const [showDone, setShowDone] = useState(false);

  const act = async (fn) => {
    try { setShopping(await fn()); } catch (e) { notify(e.message, 'err'); }
  };
  const toggle = (it) => {
    // okamžitá odezva, pak server
    setShopping((s) => {
      const groups = s.groups.map((g) => ({ ...g, items: g.items.filter((x) => x.id !== it.id) })).filter((g) => g.items.length);
      return it.done
        ? { ...s, done: s.done.filter((x) => x.id !== it.id) }
        : { ...s, groups, done: [{ ...it, done: true }, ...s.done], open_count: s.open_count - 1, done_count: s.done_count + 1 };
    });
    act(() => api.patch(`/shopping/${it.id}`, { done: !it.done }));
  };

  const total = shopping.open_count + shopping.done_count;
  const pct = total ? Math.round((shopping.done_count / total) * 100) : 0;

  return (
    <div className={`shop ${compact ? 'shop-compact' : ''}`}>
      <div className="shop-progress">
        <div className="shop-progress-text"><strong>{shopping.open_count}</strong> {plural(shopping.open_count, 'zbývá', 'zbývají', 'zbývá')} · {shopping.done_count} v košíku</div>
        <div className="progress"><div style={{ width: `${pct}%` }} /></div>
      </div>
      <QuickAdd />

      {shopping.groups.length === 0 && shopping.done_count === 0 && (
        <p className="empty-small">Seznam je prázdný. Přidejte položku nahoře, nebo suroviny z receptu či z jídelníčku.</p>
      )}

      {shopping.groups.map((g) => (
        <section key={g.category} className="card shop-group">
          <h3 className="shop-cat">{g.category}</h3>
          {g.items.map((it) => (
            <div key={it.id} className="shop-item">
              <button className="shop-check" onClick={() => toggle(it)} aria-label={`Koupeno: ${it.name}`}>
                <Checkbox checked={false} />
                <span className="shop-text">{it.qty && <strong>{it.qty} </strong>}{it.name}</span>
                {it.recipes.length > 0 && (
                  <span className="pill badge-src" title={it.recipes.join(', ')}>
                    {it.recipes.length === 1 ? it.recipes[0] : `${it.recipes.length} recepty`}
                  </span>
                )}
              </button>
              <button className="icon-btn icon-btn-sm" onClick={() => setMenu(it)} aria-label={`Možnosti: ${it.name}`}><Icon name="more" /></button>
            </div>
          ))}
        </section>
      ))}

      {shopping.done_count > 0 && (
        <section className="shop-done">
          <div className="shop-done-head">
            <button className="link-btn" onClick={() => setShowDone((v) => !v)}>
              <Icon name={showDone ? 'up' : 'down'} size={16} /> V košíku · {shopping.done_count}
            </button>
            <button className="link-btn danger" onClick={() => act(() => api.del('/shopping/done'))}>Smazat nakoupené</button>
          </div>
          {showDone && shopping.done.map((it) => (
            <button key={it.id} className="shop-item shop-item-done shop-check" onClick={() => toggle(it)}>
              <Checkbox checked />
              <span className="shop-text">{it.qty && `${it.qty} `}{it.name}</span>
            </button>
          ))}
        </section>
      )}

      <Sheet open={!!menu} onClose={() => setMenu(null)} title={menu?.name || ''}>
        {menu && (
          <>
            {menu.recipes.length > 0 && <p className="muted small">Z receptů: {menu.recipes.join(', ')}</p>}
            <label className="field">
              <span>Kategorie (platí pro tuto surovinu i příště)</span>
              <select value={menu.category_id} onChange={async (e) => {
                await api.patch(`/ingredients/${menu.ingredient_id}`, { category_id: Number(e.target.value) });
                setMenu(null);
                act(() => api.get('/shopping'));
              }}>
                {meta.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
            <button className="btn btn-outline btn-block danger" onClick={() => { setMenu(null); act(() => api.del(`/shopping/${menu.id}`)); }}>
              <Icon name="trash" size={18} /> Odebrat ze seznamu
            </button>
          </>
        )}
      </Sheet>
    </div>
  );
}
