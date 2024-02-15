/* eslint-disable @next/next/no-img-element */
import { ICombatUnit } from '@wowarenalogs/parser';

import { useClientContext } from '../../../hooks/ClientContext';
import { realmIdToRegion } from '../../../utils/realms';

interface IProps {
  player: ICombatUnit;
}

export function SeramateLink({ player }: IProps) {
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
    serverName = serverName.slice(0, slashsplit) + ' ' + serverName.slice(slashsplit);
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <button
      className="btn btn-xs gap-1"
      onClick={() => {
        clientContext.openExternalURL(
          `https://seramate.com/${encodeURIComponent(realmIdToRegion(realmId))}/${encodeURIComponent(
            serverName,
          )}/${encodeURIComponent(playerName)}`,
        );
      }}
    >
      <img
        height={22}
        width={22}
        alt="seramate.com Link"
        title="seramate.com Link"
        src={'https://seramate.com/favicon.ico'}
      />
      Check PvP
    </button>
  );
}
