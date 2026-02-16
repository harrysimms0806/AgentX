import { cn } from '../utils/cn';

interface SidebarItemProps {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  collapsed?: boolean;
  onClick?: () => void;
}

export function SidebarItem({ icon, label, active, collapsed, onClick }: SidebarItemProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'sidebar-item w-full transition-all duration-200',
        active && 'active',
        collapsed && 'justify-center px-2'
      )}
      title={collapsed ? label : undefined}
    >
      <span className="flex-shrink-0 w-5 h-5">{icon}</span>
      {!collapsed && (
        <span className="text-sm font-medium truncate">{label}</span>
      )}
    </button>
  );
}
