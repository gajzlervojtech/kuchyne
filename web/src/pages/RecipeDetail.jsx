import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, DAYS_SHORT, fmtNum, plural } from '../api';
import { Icon } from '../icons';
import { useApp } from '../store';
import { Segmented, Sheet } from '../components/ui';
import AddToListSheet from '../components/AddToListSheet';

const UNIT_PLURAL = {
  'lžíce': ['lžíce', 'lžíce', 'lžic'], 'lžička': ['lžička', 'lžičky', 'lžiček'], hrnek: ['hrnek', 'hrnky', 'hrnků'],
  'stroužek': ['stroužek', 'stroužky', 'stroužků'], svazek: ['svazek', 'svazky', 'svazků'], 'plátek': ['plátek', 'plátky', 'plátků'],
  'špetka': ['špetka', 'špetky', 'špetek'], hrst: ['hrst', 'hrsti', 'hrstí'],
};
function qtyText(amount, unit) {
  if (amount == null) return unit || '';
  let a = amount; let u = unit;
  if (u === 'g' && a >= 1000) { a /= 1000; u = 'kg'; }
  if (u === 'ml' && a >= 1000) { a /= 1000; u = 'l'; }
  const f = UNIT_PLURAL[u];
  if (f) u = a === 1 ? f[0] : (Number.isInteger(a) && a >= 5 ? f[2] : f[1]);
  return `${fmtNum(a)}${u ? ` ${u}` : ''}`;
}

function PlanSheet({ open, onClose, recipe }) {
  const { notify } = useApp();
  const [plan, setPlan] = useState(null);
  const [mode, setMode] = useState('vsedni');
  useEffect(() => { if (open) api.get('/plan').then(setPlan); }, [open]);
  const put = async (url, label) => {
    try { setPlan(await api.put(url, { recipe_id: recipe.id })); notify(`Uloženo: ${label}`); onClose(); } catch (e) { notify(e.message, 'err'); }
  };
  return (
    <Sheet open={open} onClose={onClose} title="Dát do jídelníčku" wide>
      <Segmented value={mode} onChange={setMode} options={[{ value: 'vsedni', label: 'Všední dny' }, { value: 'vikend', label: 'Víkendová jídla' }]} />
      {plan && mode === 'vsedni' && (
        <div className="slot-grid">
          <span />
          {DAYS_SHORT.map((d) => <span key={d} className="slot-head">{d}</span>)}
          {plan.weeks.map((w) => (
            <div key={w.week} className="slot-row">
              <span className="slot-week">T{w.week}</span>
              {w.days.map((d) => (
                <button key={d.day} className={`slot ${d.recipe?.id === recipe.id ? 'slot-this' : ''}`}
                  title={d.recipe ? d.recipe.name : 'prázdné'}
                  onClick={() => put(`/plan/weekday/${w.week}/${d.day}`, `Týden ${w.week}, ${DAYS_SHORT[d.day - 1]}`)}>
                  {d.recipe ? <span className="slot-name">{d.recipe.name}</span> : <Icon name="plus" size={14} />}
                </button>
              ))}
            </div>
          ))}
          <p className="muted small" style={{ gridColumn: '1 / -1' }}>Klepnutím na políčko tam recept dáte (původní jídlo se nahradí).</p>
        </div>
      )}
      {plan && mode === 'vikend' && (
        <div className="slot-wk">
          {plan.weekend_slots.map((s) => (
            <button key={s.slot} className={`slot slot-big ${s.recipe?.id === recipe.id ? 'slot-this' : ''}`}
              onClick={() => put(`/plan/weekend/${s.slot}`, `víkendové jídlo ${s.slot}`)}>
              <span className="slot-num">{s.slot}</span>
              <span className="slot-name">{s.recipe ? s.recipe.name : 'volné'}</span>
            </button>
          ))}
        </div>
      )}
    </Sheet>
  );
}

export default function RecipeDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const { notify } = useApp();
  const [r, setR] = useState(null);
  const [servings, setServings] = useState(4);
  const [tab, setTab] = useState('suroviny');
  const [note, setNote] = useState('');
  const [addOpen, setAddOpen] = useState(false);
  const [planOpen, setPlanOpen] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.get(`/recipes/${id}`).then((d) => { setR(d); setServings(d.servings); setNote(d.note); }).catch((e) => setError(e.message));
  }, [id]);

  if (error) return <div className="empty">{error} <Link to="/">Zpět na recepty</Link></div>;
  if (!r) return <div className="empty muted">Načítám…</div>;

  const factor = servings / r.servings;
  const steps = r.steps.split(/\n+/).map((s) => s.trim()).filter(Boolean);

  const remove = async () => {
    if (!window.confirm(`Opravdu smazat recept „${r.name}“?`)) return;
    await api.del(`/recipes/${r.id}`);
    notify('Recept smazán');
    nav('/');
  };

  return (
    <div className="page page-detail">
      <div className="detail-hero">
        {r.photo ? <img src={r.photo} alt="" /> : <div className="detail-hero-empty"><Icon name="plate" size={56} stroke={1} /></div>}
        <button className="hero-btn hero-left" onClick={() => (window.history.length > 1 ? nav(-1) : nav('/'))} aria-label="Zpět"><Icon name="back" /></button>
        <Link to={`/recept/${r.id}/upravit`} className="hero-btn hero-right" aria-label="Upravit recept"><Icon name="edit" size={18} /></Link>
      </div>

      <div className="detail-card">
        <h1 className="detail-title">{r.name}</h1>
        <div className="chips">
          <span className="chip chip-muted">{r.kind === 'dezert' ? 'Dezert' : 'Hlavní jídlo'}</span>
          {r.tags.map((t) => <span key={t} className="chip chip-accent">{t}</span>)}
        </div>
        <div className="stats">
          <div><span className="stat-label">PŘÍPRAVA</span><span className="stat-val">{r.prep_min ? `${r.prep_min} min` : '–'}</span></div>
          <div><span className="stat-label">VAŘENÍ</span><span className="stat-val">{r.cook_min ? `${r.cook_min} min` : '–'}</span></div>
          <div className="stat-serv">
            <button onClick={() => setServings((s) => Math.max(1, s - 1))} aria-label="Méně porcí">−</button>
            <span><span className="stat-label">PORCE</span><span className="stat-val">{servings}</span></span>
            <button onClick={() => setServings((s) => s + 1)} aria-label="Více porcí">+</button>
          </div>
        </div>
        <div className="tabs" role="tablist">
          {[['suroviny', 'Suroviny'], ['postup', 'Postup'], ['poznamky', 'Poznámky']].map(([k, l]) => (
            <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'active' : ''} onClick={() => setTab(k)}>{l}</button>
          ))}
        </div>

        {tab === 'suroviny' && (
          <ul className="ing-list">
            {r.ingredients.length === 0 && <li className="muted">Recept zatím nemá suroviny.</li>}
            {r.ingredients.map((i) => (
              <li key={i.id}>
                <span className="ing-qty">{qtyText(i.amount == null ? null : i.amount * factor, i.unit)}</span>
                <span className="ing-name">{i.name}{i.note && <span className="muted"> · {i.note}</span>}</span>
                {i.in_list && <span className="pill badge-merge">v seznamu</span>}
                {!i.in_list && i.pantry && <span className="pill badge-muted">doma</span>}
              </li>
            ))}
          </ul>
        )}
        {tab === 'postup' && (
          steps.length
            ? <ol className="steps">{steps.map((s, i) => <li key={i}>{s}</li>)}</ol>
            : <p className="muted">Postup zatím chybí.</p>
        )}
        {tab === 'poznamky' && (
          <div className="note-box">
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={5} placeholder="Poznámky, tipy, co příště jinak…" />
            <button className="btn btn-outline" onClick={async () => { await api.patch(`/recipes/${r.id}/note`, { note }); notify('Poznámka uložena'); }}>Uložit poznámku</button>
          </div>
        )}
        <button className="link-btn danger detail-delete" onClick={remove}><Icon name="trash" size={16} /> Smazat recept</button>
      </div>

      <div className="action-bar">
        <button className="btn btn-outline" onClick={() => setPlanOpen(true)}><Icon name="calendar" size={18} />Do jídelníčku</button>
        <button className="btn btn-primary btn-grow" onClick={() => setAddOpen(true)} disabled={!r.ingredients.length}>
          <Icon name="cart" size={18} />Do nákupu
        </button>
      </div>

      <AddToListSheet open={addOpen} onClose={() => setAddOpen(false)}
        source={{ recipes: [{ id: r.id, servings }] }}
        subtitle={`${r.name} · ${servings} ${plural(servings, 'porce', 'porce', 'porcí')}.`} />
      <PlanSheet open={planOpen} onClose={() => setPlanOpen(false)} recipe={r} />
    </div>
  );
}
