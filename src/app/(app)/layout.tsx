import { AppNav } from '@/components/app-nav';

export default function AppLayout({ children }: { children: React.ReactNode }) { return <div className="min-h-screen"><AppNav/><main className="mx-auto max-w-[1440px] px-4 py-6 md:px-8 md:py-8">{children}</main></div>; }
