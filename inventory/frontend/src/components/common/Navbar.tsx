import { NavLink } from 'react-router-dom';
import { Map, Building2, LayoutDashboard, Moon, Sun, LogOut } from 'lucide-react';
import { useTheme } from '@/context/ThemeContext';
import { useAuth } from '@/context/AuthContext';
import { invPath, useInventoryRoot } from '@/utils/inventoryPaths';
import { PrismLogo } from '@/components/common/PrismLogo';
import clsx from 'clsx';

const linkClass = ({ isActive }: { isActive: boolean }) =>
  clsx('nav-item', isActive && 'nav-item-active');

export function Navbar() {
  const { theme, toggle } = useTheme();
  const { authRequired, clearApiKey } = useAuth();
  const root = useInventoryRoot();
  function signOut() {
    clearApiKey();
    window.location.reload();
  }
  return (
    <header
      className="border-b"
      style={{ background: 'var(--panel)', borderColor: 'var(--border)' }}
    >
      <div className="flex w-full flex-wrap items-center justify-between gap-4 px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <PrismLogo className="h-9 w-9 shrink-0 text-cyan-400" />
          <span
            className="text-lg font-semibold tracking-tight"
            style={{ color: 'var(--brand-color)' }}
          >
            Network Equipment Inventory
          </span>
        </div>
        <nav className="flex flex-wrap items-center gap-1">
          <NavLink to={invPath(root)} className={linkClass} end>
            <Map className="h-4 w-4" strokeWidth={2} />
            Map
          </NavLink>
          <NavLink to={invPath(root, 'sites')} className={linkClass}>
            <Building2 className="h-4 w-4" strokeWidth={2} />
            Sites
          </NavLink>
          <NavLink to={invPath(root, 'dashboard')} className={linkClass}>
            <LayoutDashboard className="h-4 w-4" strokeWidth={2} />
            Dashboard
          </NavLink>
          <button
            type="button"
            onClick={toggle}
            className="nav-item ml-2"
            aria-label="Toggle theme"
          >
            {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            {theme === 'dark' ? 'Light' : 'Dark'}
          </button>
          {authRequired && (
            <button
              type="button"
              onClick={signOut}
              className="nav-item"
              aria-label="Sign out"
            >
              <LogOut className="h-4 w-4" />
              Sign out
            </button>
          )}
        </nav>
      </div>
    </header>
  );
}
