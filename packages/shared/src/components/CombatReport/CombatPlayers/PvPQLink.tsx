import { ICombatUnit } from '@wowarenalogs/parser';

import { realmSlug } from '../../../utils/realms';
import { ExternalCharacterLink } from './ExternalCharacterLink';

interface IProps {
  player: ICombatUnit;
}

// pvpq.net only serves US and EU characters.
const PVPQ_REGIONS = ['us', 'eu'];

export function PvPQLink({ player }: IProps) {
  return (
    <ExternalCharacterLink
      player={player}
      label="PvPQ.net"
      iconSrc="/pvpq-favicon.png"
      iconAlt="pvpq.net Link"
      buildUrl={({ playerName, serverName, region }) => {
        if (!PVPQ_REGIONS.includes(region)) {
          return null;
        }
        const slug = realmSlug(serverName, { separator: '-' });
        return `https://pvpq.net/${encodeURIComponent(region)}/${encodeURIComponent(slug)}/${encodeURIComponent(
          playerName,
        )}`;
      }}
    />
  );
}
