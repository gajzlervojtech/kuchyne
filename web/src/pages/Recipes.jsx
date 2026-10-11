import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { Icon } from '../icons';
import { useIsDesktop } from '../store';
import { PageHead, Segmented, Thumb } from '../components/ui';
import ShoppingList from '../components/ShoppingList';

function TodayCard() {
  const [today, setToday] = useState(null);
  useEffect(() => {
    api.get('/plan').then((p) => {
      const dow = p.today_dow;
      if (dow <= 5) {
        const r = p.weeks[p.current_week - 1].days[dow - 1].recipe;
        setToday(r ? { label: `Dnes · Týden ${p.current_week}`, recipe: r } : null);
      } else {
        const r = p.weekend_choice[dow === 6 ? 'so' : 'ne'];
        setToday(r ? { label: dow === 6 ? 'Dnes · sobota' : 'Dnes · neděle', recipe: r } : null);
      }
    }).catch(() => {});
  }, []);
  if (!today) return null;
  return (
    <Link to={`/recept/${today.recipe.id}`} className="card today">
      <Thumb src={today.recipe.thumb} className="thumb-md" />
      <span className="today-text">
        <span className="today-label">{today.label}</span>
        <span className="today-name">{today.recipe.name}</span>
      </span>
      <Icon name="next" size={18} className="muted" />
    </Link>
  );
}

export default function Recipes() {
  const [params, setParams] = useSearchParams();
  const kind = params.get('druh') === 'dezert' ? 'dezert' : 'hlavni';
  const [q, setQ] = useState('');
  const [data, setData] = useState({ recipes: [], counts: { hlavni: 0, dezert: 0 } });
  const [loading, setLoading] = useState(true);
  const desktop = useIsDesktop();

  useEffect(() => {
    const t = setTimeout(() => {
      api.get(`/recipes?kind=${kind}&q=${encodeURIComponent(q)}`).then((d) => { setData(d); setLoading(false); }).catch(() => setLoading(false));
    }, q ? 200 : 0);
    return () => clearTimeout(t);
  }, [kind, q]);

  return (
    <div className="page page-recipes">
      <div className="page-main">
        <PageHead title="Recepty"
          right={<>
            <Link to="/nastaveni" className="icon-btn only-mobile" aria-label="Nastavení"><Icon name="gear" size={22} /></Link>
            <Link to="/novy-recept" className="btn btn-primary only-desktop"><Icon name="plus" size={18} stroke={2.2} />Nový recept</Link>
          </>} />
        <div className="pad-x">
          <label className="search">
            <Icon name="search" size={18} />
            <input type="search" placeholder="Hledat recept nebo surovinu" value={q} onChange={(e) => setQ(e.target.value)} />
          </label>
          <Segmented className="seg-recipes" value={kind}
            onChange={(v) => setParams(v === 'dezert' ? { druh: 'dezert' } : {})}
            options={[
              { value: 'hlavni', label: `Hlavní jídla · ${data.counts.hlavni}` },
              { value: 'dezert', label: `Dezerty · ${data.counts.dezert}` },
            ]} />
          {!q && kind === 'hlavni' && <TodayCard />}

          {!loading && data.recipes.length === 0 && (
            <div className="empty">
              <Icon name="plate" size={40} stroke={1.2} />
              <p>{q ? 'Nic nenalezeno.' : 'Zatím tu nejsou žádné recepty.'}</p>
              {!q && <Link to={`/novy-recept${kind === 'dezert' ? '?druh=dezert' : ''}`} className="btn btn-primary">Přidat první recept</Link>}
            </div>
          )}

          <div className="recipe-grid">
            {data.recipes.map((r) => (
              <Link key={r.id} to={`/recept/${r.id}`} className="card recipe-card">
                <Thumb src={r.thumb} className="recipe-img" />
                <div className="recipe-body">
                  <h2>{r.name}</h2>
                  <div className="recipe-meta">
                    {r.total_min && <><Icon name="clock" size={14} stroke={2} />{r.total_min} min</>}
                    {r.tags[0] && <span className="chip chip-muted">{r.tags.length > 1 ? `${r.tags[0]} +${r.tags.length - 1}` : r.tags[0]}</span>}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>
      {desktop && (
        <aside className="page-aside">
          <div className="card aside-card">
            <h2 className="aside-title">Nákupní seznam</h2>
            <ShoppingList compact />
          </div>
        </aside>
      )}
      <Link to={`/novy-recept${kind === 'dezert' ? '?druh=dezert' : ''}`} className="fab only-mobile" aria-label="Přidat recept"><Icon name="plus" size={24} stroke={2.2} /></Link>
    </div>
  );
}
