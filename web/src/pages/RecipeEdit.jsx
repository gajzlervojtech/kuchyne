import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { Icon } from '../icons';
import { useApp } from '../store';
import { PageHead, Segmented } from '../components/ui';
import IngredientInput from '../components/IngredientInput';

let uid = 0;
const newRow = () => ({ key: `n${++uid}`, ingredient_id: null, name: '', category: null, category_id: null, amount: '', unit: '', note: '' });

function NewIngredientCategory({ row, onChange }) {
  const { meta } = useApp();
  const [suggested, setSuggested] = useState(null);
  useEffect(() => {
    const t = setTimeout(() => {
      api.get(`/ingredients/suggest?name=${encodeURIComponent(row.name)}`).then((s) => {
        setSuggested(s.category_id);
        if (!row.category_id) onChange({ category_id: s.category_id, auto: true });
      });
    }, 300);
    return () => clearTimeout(t);
  }, [row.name]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="new-ing">
      <span className="new-ing-label">Nová surovina – kategorie:</span>
      <select value={row.category_id || ''} onChange={(e) => onChange({ category_id: Number(e.target.value), auto: false })} aria-label={`Kategorie pro ${row.name}`}>
        {meta.categories.map((c) => <option key={c.id} value={c.id}>{c.name}{c.id === suggested ? ' (návrh)' : ''}</option>)}
      </select>
    </div>
  );
}

export default function RecipeEdit() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const nav = useNavigate();
  const { meta, notify } = useApp();
  const editing = !!id;
  const [form, setForm] = useState({
    name: '', kind: params.get('druh') === 'dezert' ? 'dezert' : 'hlavni', servings: 4, prep_min: '', cook_min: '', steps: '', note: '',
  });
  const [rows, setRows] = useState([newRow(), newRow(), newRow()]);
  const [photo, setPhoto] = useState({ file: null, preview: null, remove: false });
  const [busy, setBusy] = useState(false);
  const lastInput = useRef();
  const [focusLast, setFocusLast] = useState(false);

  useEffect(() => {
    if (!editing) return;
    api.get(`/recipes/${id}`).then((r) => {
      setForm({ name: r.name, kind: r.kind, servings: r.servings, prep_min: r.prep_min ?? '', cook_min: r.cook_min ?? '', steps: r.steps, note: r.note });
      setRows([...r.ingredients.map((i) => ({
        key: `e${i.id}`, ingredient_id: i.ingredient_id, name: i.name, category: i.category, category_id: null,
        amount: i.amount == null ? '' : String(i.amount).replace('.', ','), unit: i.unit, note: i.note,
      })), newRow()]);
      setPhoto({ file: null, preview: r.photo, remove: false });
    }).catch((e) => notify(e.message, 'err'));
  }, [id, editing, notify]);

  useEffect(() => { if (focusLast) { lastInput.current?.focus(); setFocusLast(false); } }, [focusLast, rows]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target ? e.target.value : e }));
  const updRow = (key, patch) => setRows((rs) => {
    const next = rs.map((r) => (r.key === key ? { ...r, ...patch } : r));
    // poslední řádek vyplněn → přidat prázdný
    const last = next[next.length - 1];
    if (last.name.trim()) next.push(newRow());
    return next;
  });
  const move = (idx, dir) => setRows((rs) => {
    const n = [...rs]; const j = idx + dir;
    if (j < 0 || j >= n.length) return rs;
    [n[idx], n[j]] = [n[j], n[idx]];
    return n;
  });

  const save = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) { notify('Recept musí mít název', 'err'); return; }
    setBusy(true);
    const data = {
      ...form,
      remove_photo: photo.remove,
      ingredients: rows.filter((r) => r.name.trim()).map((r) => ({
        ingredient_id: r.ingredient_id, name: r.name, category_id: r.ingredient_id ? null : r.category_id,
        amount: r.amount, unit: r.unit, note: r.note,
      })),
    };
    const fd = new FormData();
    fd.append('data', JSON.stringify(data));
    if (photo.file) fd.append('photo', photo.file);
    try {
      const saved = editing ? await api.put(`/recipes/${id}`, fd) : await api.post('/recipes', fd);
      notify('Recept uložen');
      nav(`/recept/${saved.id}`, { replace: true });
    } catch (err) { notify(err.message, 'err'); setBusy(false); }
  };

  return (
    <form className="page page-edit" onSubmit={save}>
      <PageHead title={editing ? 'Upravit recept' : 'Nový recept'}
        left={<button type="button" className="icon-btn head-back" onClick={() => nav(-1)} aria-label="Zpět"><Icon name="back" /></button>}
        right={<button type="submit" className="btn btn-save" disabled={busy}>{busy ? 'Ukládám…' : 'Uložit'}</button>} />

      <div className="pad-x edit-grid">
        <div className="edit-col">
          <label className="field"><span>Název</span>
            <input type="text" value={form.name} onChange={set('name')} placeholder="např. Tikka masala s rýží" required />
          </label>
          <div className="field"><span>Druh</span>
            <Segmented value={form.kind} onChange={set('kind')} options={[{ value: 'hlavni', label: 'Hlavní jídlo' }, { value: 'dezert', label: 'Dezert' }]} />
          </div>
          <div className="field-row">
            <label className="field"><span>Porce</span><input type="number" min="1" inputMode="numeric" value={form.servings} onChange={set('servings')} /></label>
            <label className="field"><span>Příprava (min)</span><input type="number" min="0" inputMode="numeric" value={form.prep_min} onChange={set('prep_min')} /></label>
            <label className="field"><span>Vaření (min)</span><input type="number" min="0" inputMode="numeric" value={form.cook_min} onChange={set('cook_min')} /></label>
          </div>

          <div className="field"><span>Fotka</span>
            <div className="photo-edit">
              {photo.preview && !photo.remove
                ? <img src={photo.preview} alt="" />
                : <div className="photo-empty"><Icon name="camera" size={28} stroke={1.5} /></div>}
              <div className="photo-actions">
                <label className="btn btn-outline">
                  <Icon name="camera" size={18} />{photo.preview && !photo.remove ? 'Změnit fotku' : 'Vyfotit / vybrat'}
                  <input type="file" accept="image/*" hidden onChange={(e) => {
                    const f = e.target.files[0];
                    if (f) setPhoto({ file: f, preview: URL.createObjectURL(f), remove: false });
                  }} />
                </label>
                {photo.preview && !photo.remove && (
                  <button type="button" className="link-btn danger" onClick={() => setPhoto({ file: null, preview: null, remove: true })}>Odebrat fotku</button>
                )}
                <span className="muted small">Fotka se automaticky zmenší.</span>
              </div>
            </div>
          </div>
        </div>

        <div className="edit-col">
          <div className="field"><span>Suroviny · na {form.servings || '?'} porce</span>
            <div className="card ing-edit">
              {rows.map((r, idx) => (
                <div key={r.key} className="ing-row">
                  <div className="ing-row-main">
                    <input className="ing-amount" type="text" inputMode="decimal" value={r.amount} placeholder="Množ." aria-label="Množství"
                      onChange={(e) => updRow(r.key, { amount: e.target.value })} />
                    <select className="ing-unit" value={r.unit} onChange={(e) => updRow(r.key, { unit: e.target.value })} aria-label="Jednotka">
                      <option value="">–</option>
                      {meta.units.map((u) => <option key={u} value={u}>{u}</option>)}
                    </select>
                    <IngredientInput value={r} inputRef={idx === rows.length - 1 ? lastInput : undefined}
                      onChange={(v) => updRow(r.key, { ...v })} />
                    <div className="ing-tools">
                      <button type="button" className="icon-btn icon-btn-sm" onClick={() => move(idx, -1)} aria-label="Posunout nahoru" disabled={idx === 0}><Icon name="up" size={16} /></button>
                      <button type="button" className="icon-btn icon-btn-sm" onClick={() => setRows((rs) => (rs.length > 1 ? rs.filter((x) => x.key !== r.key) : [newRow()]))} aria-label="Odebrat surovinu"><Icon name="close" size={16} /></button>
                    </div>
                    <div className="ing-row-cat">
                      {r.ingredient_id && r.category && <span className="ing-cat">{r.category}</span>}
                      {!r.ingredient_id && r.name.trim().length >= 2 && (
                        <NewIngredientCategory row={r} onChange={({ category_id }) => updRow(r.key, { category_id })} />
                      )}
                    </div>
                  </div>
                </div>
              ))}
              <button type="button" className="link-btn add-row" onClick={() => { setRows((rs) => [...rs, newRow()]); setFocusLast(true); }}>
                <Icon name="plus" size={16} stroke={2.2} /> Další surovina
              </button>
            </div>
          </div>

          <label className="field"><span>Postup (každý krok na nový řádek)</span>
            <textarea rows={8} value={form.steps} onChange={set('steps')} placeholder={'Cibuli nakrájejte a osmahněte.\nPřidejte maso…'} />
          </label>
          <label className="field"><span>Poznámka</span>
            <textarea rows={3} value={form.note} onChange={set('note')} />
          </label>
        </div>
      </div>
    </form>
  );
}
