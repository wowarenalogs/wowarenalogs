/* eslint-disable @next/next/no-img-element */
import { ICombatUnit } from '@wowarenalogs/parser';

import { useClientContext } from '../../../hooks/ClientContext';
import { parsePlayerName, realmIdToRegion } from '../../../utils/realms';

export interface ExternalCharacterLinkTarget {
  player: ICombatUnit;
  playerName: string;
  serverName: string;
  realmId: string;
  region: string;
}

interface IProps {
  player: ICombatUnit;
  label: string;
  iconSrc: string;
  iconAlt: string;
  iconSize?: number;
  /** Return the URL to open, or null to hide the button for this player. */
  buildUrl: (target: ExternalCharacterLinkTarget) => string | null;
}

/**
 * Shared button shell for the third-party character profile links shown on a player card.
 * Handles name parsing and region lookup so each site only has to describe its URL scheme.
 */
export function ExternalCharacterLink({ player, label, iconSrc, iconAlt, iconSize = 22, buildUrl }: IProps) {
  const clientContext = useClientContext();
  const { playerName, serverName } = parsePlayerName(player.name);
  if (serverName === undefined) {
    return null;
  }
  const realmId = player.id.split('-')[1];
  const region = realmIdToRegion(realmId);

  const url = buildUrl({ player, playerName, serverName, realmId, region });
  if (url === null) {
    return null;
  }

  return (
    <button type="button" className="btn btn-xs gap-1" onClick={() => clientContext.openExternalURL(url)}>
      <img height={iconSize} width={iconSize} alt={iconAlt} title={iconAlt} src={iconSrc} />
      {label}
    </button>
  );
}
