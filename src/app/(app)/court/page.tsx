import { redirect } from 'next/navigation';

export default async function CourtRedirect({ searchParams }: { searchParams: Promise<{ research?: string; r?: string }> }) {
  const params = await searchParams;
  const id = params.research ?? params.r;
  redirect(id ? `/session?r=${encodeURIComponent(id)}` : '/lab');
}
