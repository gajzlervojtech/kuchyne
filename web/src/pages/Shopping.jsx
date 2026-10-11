import { useEffect } from 'react';
import { useApp } from '../store';
import { PageHead } from '../components/ui';
import ShoppingList from '../components/ShoppingList';

export default function Shopping() {
  const { refreshShopping } = useApp();
  useEffect(() => { refreshShopping(); }, [refreshShopping]);
  return (
    <div className="page page-shopping">
      <PageHead title="Nákupní seznam" />
      <div className="pad-x shop-wrap"><ShoppingList /></div>
    </div>
  );
}
