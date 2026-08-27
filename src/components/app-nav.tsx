'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BarChart3, FlaskConical, Settings, Users } from 'lucide-react';

const NAV = [
  { href: '/lab', label: '工作台', icon: FlaskConical },
  { href: '/personas', label: '用户画像', icon: Users },
  { href: '/insights', label: '研究记录', icon: BarChart3 },
  { href: '/settings', label: '设置', icon: Settings },
];

export function AppNav() {
  const pathname = usePathname();
  return <header className="sticky top-0 z-40 border-b border-black/5 bg-white/78 backdrop-blur-xl"><div className="mx-auto flex h-16 max-w-[1440px] items-center justify-between px-4 md:px-8"><Link href="/lab" className="flex items-center gap-2.5" aria-label="PersonaLab 工作台"><span className="grid h-9 w-9 place-items-center rounded-xl bg-[#172033] text-sm font-bold text-white">P</span><div><div className="text-[15px] font-semibold tracking-tight">PersonaLab</div><div className="text-[10px] text-[#7b8494]">AI USER RESEARCH</div></div></Link><nav className="flex items-center gap-1" aria-label="主导航">{NAV.map((item) => { const active = pathname.startsWith(item.href) || (item.href === '/insights' && pathname.startsWith('/session')); const Icon = item.icon; return <Link key={item.href} href={item.href} className={`flex items-center gap-2 rounded-full px-3 py-2 text-sm transition ${active ? 'bg-[#edf2fb] font-semibold text-[#1d55ca]' : 'text-[#677185] hover:bg-black/[0.035] hover:text-[#172033]'}`}><Icon className="h-4 w-4"/><span className="hidden sm:inline">{item.label}</span></Link>; })}</nav></div></header>;
}
