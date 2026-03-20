/* eslint-disable @next/next/no-img-element */
import { ICombatUnit } from '@wowarenalogs/parser';

import { useClientContext } from '../../../hooks/ClientContext';
import { realmIdToRegion } from '../../../utils/realms';

interface IProps {
  player: ICombatUnit;
}

export function DrustvarLink({ player }: IProps) {
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
      if (/[a-z]/.test(serverName[i - 1])) {
        slashsplit = i;
      }
    }
  }
  if (slashsplit) {
    serverName = serverName.slice(0, slashsplit) + '-' + serverName.slice(slashsplit);
  }
  serverName = serverName.replace("'", '').toLowerCase();

  return (
    <button
      className="btn btn-xs gap-1"
      onClick={() => {
        clientContext.openExternalURL(
          `https://drustvar.com/character/${encodeURIComponent(realmIdToRegion(realmId))}/${encodeURIComponent(
            serverName,
          )}/${encodeURIComponent(playerName)}`,
        );
      }}
    >
      <img height={22} width={22} alt="drustvar.com Link" title="drustvar.com Link" src={'/drustvar-favicon.png'} />
      Drustvar
    </button>
  );
}
