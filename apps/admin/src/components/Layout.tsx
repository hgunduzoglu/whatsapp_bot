import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api, getToken, setToken } from '../lib/api';
import type { AdminUser } from '../lib/types';

const NAV_ITEMS = [
  { to: '/', label: 'Panel' },
  { to: '/customers', label: 'Müşteriler' },
  { to: '/seedling-orders', label: 'Fidan Siparişleri' },
  { to: '/promissory-notes', label: 'Senetler' },
  { to: '/reports', label: 'Raporlar' },
  { to: '/audit-logs', label: 'İşlem Kayıtları' },
  { to: '/backups', label: 'Yedekler' },
];

export function Layout() {
  const navigate = useNavigate();
  const { data: user } = useQuery({
    queryKey: ['me'],
    queryFn: () => api<AdminUser>('/auth/me'),
    enabled: Boolean(getToken()),
    staleTime: Infinity,
  });

  const logout = () => {
    setToken(null);
    navigate('/login');
  };

  return (
    <div className="flex min-h-screen bg-slate-50">
      <aside className="flex w-56 flex-col border-r border-slate-200 bg-white">
        <div className="border-b border-slate-100 px-4 py-4">
          <h1 className="text-sm font-bold tracking-wide text-emerald-800">YÖNETİM PANELİ</h1>
        </div>
        <nav className="flex-1 space-y-0.5 p-2">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                `block rounded-md px-3 py-2 text-sm ${
                  isActive
                    ? 'bg-emerald-50 font-medium text-emerald-800'
                    : 'text-slate-600 hover:bg-slate-50'
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-slate-100 p-3 text-xs text-slate-500">
          <p className="mb-2 truncate">{user?.email}</p>
          <button onClick={logout} className="text-red-600 hover:underline">
            Çıkış yap
          </button>
        </div>
      </aside>
      <main className="flex-1 p-6">
        <Outlet />
      </main>
    </div>
  );
}
