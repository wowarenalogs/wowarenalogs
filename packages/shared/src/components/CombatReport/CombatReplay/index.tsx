import React from 'react';
import dynamic from 'next/dynamic';

const CombatReplayClient = dynamic(
  () => import('./CombatReplayClient').then((mod) => mod.CombatReplayClient),
  { ssr: false },
);

export function CombatReplay() {
  return <CombatReplayClient />;
}
