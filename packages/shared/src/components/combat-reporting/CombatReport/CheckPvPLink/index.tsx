import { ICombatUnit } from 'wow-combat-log-parser';

import styles from './index.module.css';

import { useClientContext } from '../../../../hooks/ClientContext';
import { realmIdToRegion } from '../../../../utils/realms';

interface IProps {
  player: ICombatUnit;
}

export function CheckPvPLink({ player }: IProps) {
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

  return (
    <img
      className={styles['checkpvp-link']}
      alt="check-pvp.fr Link"
      title="check-pvp.fr Link"
      src={'https://check-tbc.fr/assets/images/logo-pvp.png'}
      onClick={() => {
        clientContext.openExternalURL(`https://check-pvp.fr/${realmIdToRegion(realmId)}/${serverName}/${playerName}`);
      }}
    />
  );
}
