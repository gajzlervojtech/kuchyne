import { useEffect, useRef, useState } from 'react';
import { api } from '../api';
import { Icon } from '../icons';

// Políčko se šeptačem z číselníku surovin.
// value: { ingredient_id, name, category } ; onChange(newValue)
export default function IngredientInput({ value, onChange, placeholder = 'Surovina', ariaLabel = 'Surovina', inputRef }) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [active, setActive] = useState(0);
  const timer = useRef();
  const q = value.name || '';

  useEffect(() => {
    clearTimeout(timer.current);
    if (!open || q.trim().length < 2) { setItems([]); return undefined; }
    timer.current = setTimeout(() => {
      api.get(`/ingredients?q=${encodeURIComponent(q)}`).then((r) => { setItems(r); setActive(0); }).catch(() => {});
    }, 150);
    return () => clearTimeout(timer.current);
  }, [q, open]);

  const choose = (it) => {
    onChange({ ingredient_id: it.id, name: it.name, category: it.category, category_id: it.category_id });
    setOpen(false);
  };

  const exact = items.find((i) => i.name.toLocaleLowerCase('cs') === q.trim().toLocaleLowerCase('cs'));
  const showNew = q.trim().length >= 2 && !exact;
  const options = [...items, ...(showNew ? [{ id: null, name: q.trim(), isNew: true }] : [])];

  const onKeyDown = (e) => {
    if (!open || !options.length) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, options.length - 1)); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    if (e.key === 'Enter') {
      e.preventDefault();
      const o = options[active];
      if (o.isNew) setOpen(false); else choose(o);
    }
  };

  return (
    <div className="ac">
      <input ref={inputRef} type="text" value={q} placeholder={placeholder} aria-label={ariaLabel} autoComplete="off"
        className={value.ingredient_id ? 'ac-known' : ''}
        onChange={(e) => { onChange({ ingredient_id: null, name: e.target.value, category: null, category_id: null }); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => {
          setOpen(false);
          if (!value.ingredient_id && exact) choose(exact);
        }, 150)}
        onKeyDown={onKeyDown} />
      {open && options.length > 0 && (
        <div className="ac-list" role="listbox">
          {options.map((o, i) => (
            <button type="button" key={o.id ?? 'new'} role="option" aria-selected={i === active}
              className={`ac-opt ${i === active ? 'active' : ''} ${o.isNew ? 'ac-new' : ''}`}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => (o.isNew ? setOpen(false) : choose(o))}>
              {o.isNew
                ? <><Icon name="plus" size={16} stroke={2.2} /><span>Nová surovina „{o.name}“</span></>
                : <><span className="ac-name">{o.name}</span><span className="ac-cat">{o.category}</span></>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
