import { NavLink, Route, Routes, useLocation } from 'react-router-dom';
import { Icon } from './icons';
import { useApp } from './store';
import Recipes from './pages/Recipes';
import RecipeDetail from './pages/RecipeDetail';
import RecipeEdit from './pages/RecipeEdit';
import Plan from './pages/Plan';
import Shopping from './pages/Shopping';
import Settings from './pages/Settings';

function NavItems() {
  const { shopping } = useApp();
  const { pathname } = useLocation();
  const recipesActive = pathname === '/' || pathname.startsWith('/recept') || pathname.startsWith('/novy');
  return (
    <>
      <NavLink to="/" className={() => `nav-item ${recipesActive ? 'active' : ''}`}>
        <span className="nav-ico"><Icon name="book" size={22} /></span><span>Recepty</span>
      </NavLink>
      <NavLink to="/plan" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
        <span className="nav-ico"><Icon name="calendar" size={22} /></span><span>Jídelníček</span>
      </NavLink>
      <NavLink to="/nakup" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
        <span className="nav-ico">
          <Icon name="cart" size={22} />
          {shopping.open_count > 0 && <span className="badge">{shopping.open_count}</span>}
        </span>
        <span>Nákup</span>
      </NavLink>
      <NavLink to="/nastaveni" className={({ isActive }) => `nav-item nav-settings ${isActive ? 'active' : ''}`}>
        <span className="nav-ico"><Icon name="gear" size={22} /></span><span>Nastavení</span>
      </NavLink>
    </>
  );
}

export default function App() {
  return (
    <div className="app">
      <header className="app-top">
        <NavLink to="/" className="brand"><Icon name="hat" size={26} /> Naše kuchyně</NavLink>
      </header>
      <div className="app-body">
        <nav className="sidebar" aria-label="Hlavní menu"><NavItems /></nav>
        <main className="content">
          <Routes>
            <Route path="/" element={<Recipes />} />
            <Route path="/recept/:id" element={<RecipeDetail />} />
            <Route path="/recept/:id/upravit" element={<RecipeEdit />} />
            <Route path="/novy-recept" element={<RecipeEdit />} />
            <Route path="/plan" element={<Plan mode="vsedni" />} />
            <Route path="/plan/vikend" element={<Plan mode="vikend" />} />
            <Route path="/nakup" element={<Shopping />} />
            <Route path="/nastaveni" element={<Settings />} />
            <Route path="*" element={<div className="empty">Stránka neexistuje.</div>} />
          </Routes>
        </main>
      </div>
      <nav className="bottom-nav" aria-label="Hlavní menu"><NavItems /></nav>
    </div>
  );
}
