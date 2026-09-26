import type { Metadata } from 'next';
import { Dashboard } from '@/components/Dashboard';

export const metadata: Metadata = {
  title: 'Dashboard',
  description: 'Run audits, track your verification scans and download your Fix Kits.',
  robots: { index: false, follow: false },
};

export default function DashboardPage() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-12">
      <Dashboard />
    </div>
  );
}
