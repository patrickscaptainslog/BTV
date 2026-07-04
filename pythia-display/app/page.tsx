'use client';

import dynamic from 'next/dynamic';

const Display = dynamic(() => import('@/components/Display'), { ssr: false });

export default function Page() {
  return <Display />;
}
