'use client';

import dynamic from 'next/dynamic';

const LatestPageContent = dynamic(() => import('../../../components/LatestPageContent'), { ssr: false });

export default function LatestPage() {
  return <LatestPageContent />;
}
