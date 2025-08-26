/* eslint-disable @next/next/no-img-element */
import { ICombatUnit } from '@wowarenalogs/parser';

import { useClientContext } from '../../../hooks/ClientContext';
import { bnetLocales, realmIdToRegion } from '../../../utils/realms';

interface IProps {
  player: ICombatUnit;
}

export function GearStickLink({ player }: IProps) {
  const clientContext = useClientContext();
  // eslint-disable-next-line prefer-const
  let [playerName, serverName] = player.name.split('-');
  if (serverName === undefined) {
    return null;
  }
  const realmId = player.id.split('-')[1];
  let slashsplit = undefined;
  for (let i = 1; i < serverName.length; i++) {
    if (/[A-Z]/.test(serverName[i])) {
      // There is a capital letter somewhere in the string
      if (/[a-z]/.test(serverName[i - 1])) {
        // But the letter before was a non-capital letter (not punctuation)
        //  this is needed for stuff like Mal'Ganis
        slashsplit = i;
      }
    }
  }
  if (slashsplit) {
    serverName = serverName.slice(0, slashsplit) + '-' + serverName.slice(slashsplit);
  }
  serverName = serverName.replace("'", '');

  const locale = bnetLocales.includes(window.navigator.language.toLowerCase()) ? window.navigator.language : 'en-us';
  return (
    <button
      className="btn btn-xs gap-1"
      onClick={() => {
        const armoryUrl = btoa(
          `https://worldofwarcraft.com/${locale}/character/${realmIdToRegion(realmId)}/${serverName}/${playerName}`,
        );
        const link = `https://www.gearstick.io/diff/ladder/shuffle/${armoryUrl}/${player.spec}`;
        clientContext.openExternalURL(link);
      }}
    >
      <img
        height={24}
        width={24}
        alt="GearStick.io Link"
        title="GearStick.io Link"
        src={'http://gearstick.io/favicon.ico'}
      />
      gs.io
    </button>
  );
}
