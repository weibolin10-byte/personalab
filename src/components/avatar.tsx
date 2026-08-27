import type { Persona } from '@/lib/types';

export function initials(name: string): string { return Array.from(name.trim()).slice(-2).join('').toUpperCase() || '?'; }

export function Avatar({ persona, name, color, size = 'md', className = '' }: { persona?: Persona; name?: string; color?: string; size?: 'sm' | 'md' | 'lg'; className?: string }) {
  const value = persona?.name ?? name ?? '?';
  const background = persona?.avatarColor ?? color ?? '#66758c';
  const sizes = { sm: 'h-8 w-8 text-[11px]', md: 'h-10 w-10 text-xs', lg: 'h-14 w-14 text-base' };
  return <span className={`inline-grid shrink-0 place-items-center rounded-full font-semibold tracking-tight text-white shadow-sm ${sizes[size]} ${className}`} style={{ background }}>{initials(value)}</span>;
}
