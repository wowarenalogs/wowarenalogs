import { ICombatUnit } from '@wowarenalogs/parser';

import { realmSlug } from '../../../utils/realms';
import { ExternalCharacterLink } from './ExternalCharacterLink';

interface IProps {
  player: ICombatUnit;
}

export function CheckPvPLink({ player }: IProps) {
  return (
    <ExternalCharacterLink
      player={player}
      label="Check PvP"
      iconSrc="https://check-pvp.fr/favicon.png"
      iconAlt="check-pvp.fr Link"
      buildUrl={({ playerName, serverName, region }) => {
        const slug = realmSlug(serverName, { separator: ' ', stripApostrophes: false, lowercase: false });
        return `https://check-pvp.fr/${encodeURIComponent(region)}/${encodeURIComponent(slug)}/${encodeURIComponent(
          playerName,
        )}`;
      }}
    />
  );
}
