import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, DAYS, DAYS_SHORT, fmtDate } from '../api';
import { Icon } from '../icons';
import { useApp, useIsDesktop } from '../store';
import { PageHead, Segmented, Sheet, Thumb } from '../components/ui';
import RecipePicker from '../components/RecipePicker';
import AddToListSheet from '../components/AddToListSheet';

function Toggle({ mode }) {
  const nav = useNavigate();
  return (
    <Segmented className="seg-plan" value={mode} onChange={(v) => nav(v === 'vikend' ? '/plan/vikend' : '/plan')}
      options={[{ value: 'vsedni', label: 'Všední dny' }, { value: 'vikend', label: 'Víkendová jídla' }]} />
  );
}

function DayCard({ day, recipe, onEdit }) {
  return (
    <div className="card day-card">
      <button className="day-pick" onClick={onEdit}>
        {recipe ? <Thumb src={recipe.thumb} className="thumb-md" /> : <span className="thumb thumb-md thumb-add"><Icon name="plus" size={18} stroke={2} /></span>}
        <span className="day-text">
          <span className="day-label">{DAYS[day - 1].toUpperCase()}</span>
          <span className={`day-name ${recipe ? '' : 'day-empty'}`}>{recipe ? recipe.name : 'Vybrat recept'}</span>
        </span>
        <Icon name="edit" size={18} className="muted" />
      </button>
      {recipe && <Link to={`/recept/${recipe.id}`} className="day-open" aria-label={`Otevřít recept ${recipe.name}`}><Icon name="next" size={16} /></Link>}
    </div>
  );
}

function Weekdays({ plan, setPlan }) {
  const desktop = useIsDesktop();
  const [week, setWeek] = useState(plan.today_dow >= 6 ? plan.next_week : plan.current_week);
  const [edit, setEdit] = useState(null); // {week, day}
  const [shopWeek, setShopWeek] = useState(null);
  const [weekMenu, setWeekMenu] = useState(false);

  const pick = async (r) => {
    setPlan(await api.put(`/plan/weekday/${edit.week}/${edit.day}`, { recipe_id: r ? r.id : null }));
    setEdit(null);
  };

  const weekTag = (w) => (w === plan.current_week ? 'TEĎ' : (plan.today_dow >= 6 && w === plan.next_week ? 'PŘÍŠTÍ' : null));

  return (
    <>
      <div className="plan-info">
        <span className="chip chip-muted"><Icon name="lock" size={13} stroke={2} />Stálá šablona · mění se jen ručně</span>
        <span className="muted small">Tento týden ({fmtDate(plan.this_week.from)}–{fmtDate(plan.this_week.to)}) je <strong>Týden {plan.current_week}</strong>.{' '}
          <button className="link-btn" onClick={() => setWeekMenu(true)}>Změnit</button></span>
      </div>

      {!desktop && (
        <>
          <div className="week-chips">
            {[1, 2, 3, 4].map((w) => (
              <button key={w} className={`week-chip ${week === w ? 'active' : ''}`} onClick={() => setWeek(w)}>
                Týden {w}{weekTag(w) && <span className="week-tag">{weekTag(w)}</span>}
              </button>
            ))}
          </div>
          <div className="day-list">
            {plan.weeks[week - 1].days.map((d) => (
              <DayCard key={d.day} day={d.day} recipe={d.recipe} onEdit={() => setEdit({ week, day: d.day })} />
            ))}
          </div>
          <button className="btn btn-primary btn-block" onClick={() => setShopWeek(week)}><Icon name="cart" size={18} />Týden {week} do nákupu</button>
        </>
      )}

      {desktop && (
        <div className="weeks-desk">
          {plan.weeks.map((w) => (
            <section key={w.week} className={`card week-card ${w.week === plan.current_week ? 'week-now' : ''}`}>
              <div className="week-card-head">
                <h2>Týden {w.week}</h2>
                {weekTag(w.week) && <span className="pill badge-now">{weekTag(w.week) === 'TEĎ' ? 'TENTO TÝDEN' : 'PŘÍŠTÍ TÝDEN'}</span>}
                <button className="btn btn-outline btn-sm" onClick={() => setShopWeek(w.week)}><Icon name="cart" size={16} />Do nákupu</button>
              </div>
              <div className="week-cells">
                {w.days.map((d) => (
                  <button key={d.day} className="week-cell" onClick={() => setEdit({ week: w.week, day: d.day })}>
                    {d.recipe ? <Thumb src={d.recipe.thumb} className="cell-img" /> : <span className="thumb cell-img thumb-add"><Icon name="plus" size={20} /></span>}
                    <span className="cell-day">{DAYS_SHORT[d.day - 1]}</span>
                    <span className={`cell-name ${d.recipe ? '' : 'day-empty'}`}>{d.recipe ? d.recipe.name : 'Vybrat recept'}</span>
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      <RecipePicker open={!!edit} onClose={() => setEdit(null)} onPick={pick} allowClear
        title={edit ? `Týden ${edit.week} · ${DAYS[edit.day - 1]}` : ''} />
      <AddToListSheet open={!!shopWeek} onClose={() => setShopWeek(null)} source={{ week: shopWeek }}
        title={`Týden ${shopWeek} do nákupu`} subtitle={`Suroviny ze všech jídel Týdne ${shopWeek}.`} />
      <Sheet open={weekMenu} onClose={() => setWeekMenu(false)} title="Který týden je teď?">
        <p className="muted small">Šablona se každé pondělí posune na další týden (1 → 2 → 3 → 4 → 1). Tady jen nastavíte, kde rotace právě je.</p>
        <div className="week-chips">
          {[1, 2, 3, 4].map((w) => (
            <button key={w} className={`week-chip ${plan.current_week === w ? 'active' : ''}`}
              onClick={async () => { setPlan(await api.put('/plan/current-week', { week: w })); setWeekMenu(false); setWeek(w); }}>
              Týden {w}
            </button>
          ))}
        </div>
      </Sheet>
    </>
  );
}

function Weekend({ plan, setPlan }) {
  const [editSlot, setEditSlot] = useState(null);
  const [slotMenu, setSlotMenu] = useState(null);
  const [chooseDay, setChooseDay] = useState(null);
  const [shop, setShop] = useState(false);
  const weekendIds = plan.weekend_slots.map((s) => s.recipe?.id).filter(Boolean);
  const choice = plan.weekend_choice;

  const setChoice = async (day, recipe) => setPlan(await api.put(`/plan/weekend-choice/${day}`, { recipe_id: recipe ? recipe.id : null }));
  const dayOf = (rid) => [choice.so?.id === rid && 'SO', choice.ne?.id === rid && 'NE'].filter(Boolean).join(' + ');

  return (
    <>
      <section className="card weekend-now">
        <div className="weekend-now-head">
          <h2>Tento víkend <span className="muted small">{fmtDate(plan.weekend.from)}–{fmtDate(plan.weekend.to)}</span></h2>
          <button className="btn btn-primary btn-sm" onClick={() => setShop(true)} disabled={!choice.so && !choice.ne}><Icon name="cart" size={16} />Do nákupu</button>
        </div>
        <div className="weekend-days">
          {[['so', 'SOBOTA'], ['ne', 'NEDĚLE']].map(([d, label]) => (
            <button key={d} className="weekend-day" onClick={() => setChooseDay(d)}>
              {choice[d] ? <Thumb src={choice[d].thumb} className="thumb-sm" /> : <span className="thumb thumb-sm thumb-add"><Icon name="plus" size={16} /></span>}
              <span><span className="wd-label">{label}</span><span className="wd-name">{choice[d] ? choice[d].name : 'Vybrat'}</span></span>
            </button>
          ))}
        </div>
      </section>

      <div className="list-head">
        <h2>Víkendová jídla · {weekendIds.length}/12</h2>
        <span className="muted small">Klepnutím vyberete na sobotu/neděli nebo jídlo změníte.</span>
      </div>
      <div className="wk-grid">
        {plan.weekend_slots.map((s) => (
          <button key={s.slot} className={`card wk-card ${s.recipe && dayOf(s.recipe.id) ? 'wk-chosen' : ''}`}
            onClick={() => (s.recipe ? setSlotMenu(s) : setEditSlot(s.slot))}>
            <span className="wk-img-wrap">
              {s.recipe ? <Thumb src={s.recipe.thumb} className="wk-img" /> : <span className="thumb wk-img thumb-add"><Icon name="plus" size={22} /></span>}
              <span className="wk-num">{s.slot}</span>
              {s.recipe && dayOf(s.recipe.id) && <span className="wk-day">{dayOf(s.recipe.id)}</span>}
            </span>
            <span className={`wk-name ${s.recipe ? '' : 'day-empty'}`}>{s.recipe ? s.recipe.name : 'Přidat jídlo'}</span>
          </button>
        ))}
      </div>

      <Sheet open={!!slotMenu} onClose={() => setSlotMenu(null)} title={slotMenu?.recipe?.name || ''}>
        {slotMenu && (
          <div className="menu-list">
            <button className="btn btn-primary btn-block" onClick={() => { setChoice('so', slotMenu.recipe); setSlotMenu(null); }}>Na sobotu</button>
            <button className="btn btn-primary btn-block" onClick={() => { setChoice('ne', slotMenu.recipe); setSlotMenu(null); }}>Na neděli</button>
            <Link className="btn btn-outline btn-block" to={`/recept/${slotMenu.recipe.id}`}>Otevřít recept</Link>
            <button className="btn btn-outline btn-block" onClick={() => { setEditSlot(slotMenu.slot); setSlotMenu(null); }}>Změnit jídlo na pozici {slotMenu.slot}</button>
          </div>
        )}
      </Sheet>
      <RecipePicker open={!!editSlot} onClose={() => setEditSlot(null)} allowClear title={`Víkendové jídlo ${editSlot}`}
        onPick={async (r) => { setPlan(await api.put(`/plan/weekend/${editSlot}`, { recipe_id: r ? r.id : null })); setEditSlot(null); }} />
      <RecipePicker open={!!chooseDay} onClose={() => setChooseDay(null)} allowClear
        title={chooseDay === 'so' ? 'Na sobotu' : 'Na neděli'} preferIds={weekendIds} preferLabel="Víkendová jídla"
        onPick={async (r) => { await setChoice(chooseDay, r); setChooseDay(null); }} />
      <AddToListSheet open={shop} onClose={() => setShop(false)} source={{ weekend: true }} title="Víkend do nákupu"
        subtitle="Suroviny na sobotu a neděli." />
    </>
  );
}

export default function Plan({ mode }) {
  const [plan, setPlan] = useState(null);
  const { notify } = useApp();
  useEffect(() => { api.get('/plan').then(setPlan).catch((e) => notify(e.message, 'err')); }, [notify]);

  return (
    <div className="page page-plan">
      <PageHead title="Jídelníček" className="head-tabs">
        <div className="only-mobile head-toggle"><Toggle mode={mode} /></div>
      </PageHead>
      <div className="pad-x">
        <div className="only-desktop desk-toggle"><Toggle mode={mode} /></div>
        {!plan && <p className="muted">Načítám…</p>}
        {plan && mode === 'vsedni' && <Weekdays plan={plan} setPlan={setPlan} />}
        {plan && mode === 'vikend' && <Weekend plan={plan} setPlan={setPlan} />}
      </div>
    </div>
  );
}
