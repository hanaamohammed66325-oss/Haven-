'use client';
import dynamic from 'next/dynamic';
import { ComingSoon } from '@/components/ComingSoon';
import { NOTES_ENABLED } from '@/lib/featureFlags';
import { usePageTitle, useT } from '@/i18n';

const NotesWorkspace = dynamic(() => import('@/components/notes/NotesWorkspace').then(module => module.NotesWorkspace));

export default function NotesPage() {
  const { t } = useT();
  usePageTitle('nav_notes');
  return NOTES_ENABLED ? <NotesWorkspace /> : <ComingSoon title={t('nav_notes')} tag={t('comingSoon')} />;
}
