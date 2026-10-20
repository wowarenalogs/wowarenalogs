import { ICombatUnit } from '@wowarenalogs/parser';

import { realmSlug } from '../../../utils/realms';
import { ExternalCharacterLink } from './ExternalCharacterLink';

interface IProps {
  player: ICombatUnit;
}

export function SeramateLink({ player }: IProps) {
  return (
    <ExternalCharacterLink
      player={player}
      label="Seramate"
      iconSrc="https://seramate.com/favicon.ico"
      iconAlt="seramate.com Link"
      buildUrl={({ playerName, serverName, region }) => {
        const slug = realmSlug(serverName, { separator: ' ', stripApostrophes: false, lowercase: false });
        return `https://seramate.com/${encodeURIComponent(region)}/${encodeURIComponent(slug)}/${encodeURIComponent(
          playerName,
        )}`;
      }}
    />
  );
}
