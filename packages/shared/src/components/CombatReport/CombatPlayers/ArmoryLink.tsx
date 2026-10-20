import { ICombatUnit } from '@wowarenalogs/parser';

import { armoryLocale, armoryUrl } from '../../../utils/realms';
import { ExternalCharacterLink } from './ExternalCharacterLink';

interface IProps {
  player: ICombatUnit;
}

export function ArmoryLink({ player }: IProps) {
  return (
    <ExternalCharacterLink
      player={player}
      label="Armory"
      iconSrc="https://images.wowarenalogs.com/common/wow-logo-transparency-3dd2.png"
      iconAlt="WoW Armory Link"
      iconSize={24}
      buildUrl={({ playerName, serverName, region }) => armoryUrl(armoryLocale(), region, serverName, playerName)}
    />
  );
}
