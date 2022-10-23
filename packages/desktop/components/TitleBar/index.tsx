import { Button, useClientContext } from '@wowarenalogs/shared';
import { useEffect, useState } from 'react';
import { flushSync } from 'react-dom';
import { FiMaximize2, FiMinimize2, FiMinus, FiX } from 'react-icons/fi';

import styles from './index.module.css';

function TitleBar() {
  const clientContext = useClientContext();
  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
    window.wowarenalogs.win?.isMaximized().then((value) => {
      setIsMaximized(value);
    });
  }, []);

  // TODO: buttons need tooltip text
  return (
    <div className="flex flex-row item-center top-0 left-0 right-0 h-8 relative">
      <div className={`block absolute -z-10 top-0 left-0 right-0 bottom-0 ${styles['title-bar-drag']}`} />
      <div className={styles['title-bar-logo']} />
      <div className="flex-1" />
      <div className={`flex flex-row text-white ${styles['title-bar-buttons']}`}>
        <Button
          onClick={() => {
            window.wowarenalogs.win?.minimize();
          }}
        >
          <FiMinus size="16" />
        </Button>
        <Button
          onClick={() => {
            if (isMaximized) {
              window.wowarenalogs.win?.maximize(false);
              setIsMaximized(false);
            } else {
              window.wowarenalogs.win?.maximize(true);
              setIsMaximized(true);
            }
          }}
        >
          {isMaximized ? <FiMinimize2 size="16" /> : <FiMaximize2 size="16" />}
        </Button>
        <Button
          onClick={async () => {
            await clientContext.saveWindowPosition();
            flushSync(() => window.wowarenalogs.app?.quit());
          }}
        >
          <FiX size="16" />
        </Button>
      </div>
    </div>
  );
}

export default TitleBar;
