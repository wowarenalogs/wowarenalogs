/* eslint-disable @next/next/no-img-element */
import { ICombatUnit } from '@wowarenalogs/parser';

import { useClientContext } from '../../../hooks/ClientContext';
import { realmIdToRegion } from '../../../utils/realms';

interface IProps {
  player: ICombatUnit;
}

export function PvPQLink({ player }: IProps) {
  const clientContext = useClientContext();
  const [playerName, ...realmNameParts] = player.name.split('-');
  const serverName = realmNameParts.join('-');
  if (!serverName) {
    return null;
  }

  const realmId = player.id.split('-')[1];
  const realmSlug = serverName
    .replace(/([a-zа-яё])([A-ZА-ЯЁ0-9])/g, '$1-$2')
    .replace(/'/g, '')
    .replace(/\s+/g, '-')
    .toLowerCase();

  return (
    <button
      type="button"
      className="btn btn-xs gap-1"
      onClick={() => {
        clientContext.openExternalURL(
          `https://pvpq.net/${encodeURIComponent(realmIdToRegion(realmId))}/${encodeURIComponent(
            realmSlug,
          )}/${encodeURIComponent(playerName)}`,
        );
      }}
    >
      <img height={22} width={22} alt="pvpq.net Link" title="pvpq.net Link" src="/pvpq-favicon.png" />
      PvPQ.net
    </button>
  );
}
