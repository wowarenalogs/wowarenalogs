import { ICombatUnit } from '@wowarenalogs/parser';

import { realmSlug } from '../../../utils/realms';
import { ExternalCharacterLink } from './ExternalCharacterLink';

interface IProps {
  player: ICombatUnit;
}

export function DrustvarLink({ player }: IProps) {
  return (
    <ExternalCharacterLink
      player={player}
      label="Drustvar"
      iconSrc="/drustvar-favicon.png"
      iconAlt="drustvar.com Link"
      buildUrl={({ playerName, serverName, region }) => {
        const slug = realmSlug(serverName, { separator: '-' });
        return `https://drustvar.com/character/${encodeURIComponent(region)}/${encodeURIComponent(
          slug,
        )}/${encodeURIComponent(playerName)}`;
      }}
    />
  );
}
