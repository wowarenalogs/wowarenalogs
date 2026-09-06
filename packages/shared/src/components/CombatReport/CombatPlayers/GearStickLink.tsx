import { ICombatUnit } from '@wowarenalogs/parser';

import { armoryLocale, armoryUrl } from '../../../utils/realms';
import { ExternalCharacterLink } from './ExternalCharacterLink';

interface IProps {
  player: ICombatUnit;
}

export function GearStickLink({ player }: IProps) {
  return (
    <ExternalCharacterLink
      player={player}
      label="gs.io"
      iconSrc="http://gearstick.io/favicon.ico"
      iconAlt="GearStick.io Link"
      iconSize={24}
      buildUrl={({ player: unit, playerName, serverName, region }) => {
        const encodedArmoryUrl = btoa(armoryUrl(armoryLocale(), region, serverName, playerName));
        return `https://www.gearstick.io/diff/ladder/shuffle/${encodedArmoryUrl}/${unit.spec}`;
      }}
    />
  );
}
