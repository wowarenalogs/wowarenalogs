import dynamic from 'next/dynamic';
import React from 'react';

const CombatReplayClient = dynamic(() => import('./CombatReplayClient').then((mod) => mod.CombatReplayClient), {
  ssr: false,
});

export function CombatReplay() {
  return <CombatReplayClient />;
}
