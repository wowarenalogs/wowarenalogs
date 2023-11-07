import { useState } from 'react';

import { ReplayEvents } from '../CombatReplay/ReplayEvents';
import { useCombatReportContext } from '../CombatReportContext';
import { useVideoPlayerContext } from './VideoPlayerContext';

export const VideoPlayerEventsPanel = () => {
  const { combat } = useCombatReportContext();
  const { combatTime } = useVideoPlayerContext();
  const [filterByUnitId, setUnitIdFilter] = useState<string | null>(null);

  if (!combat) {
    return null;
  }

  return (
    <ReplayEvents
      currentTimeOffset={combatTime - combat.startTime}
      disableHighlight={true}
      filterByUnitId={filterByUnitId}
      setUnitIdFilter={setUnitIdFilter}
    />
  );
};
