import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { verifySessionToken } from '@/lib/session';
import AdminShell from './admin-shell';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const token = cookieStore.get('mcr_session')?.value;
  const session = token ? verifySessionToken(token) : null;

  if (!session || session.role !== 'admin') {
    notFound();
  }

  return <AdminShell>{children}</AdminShell>;
}
