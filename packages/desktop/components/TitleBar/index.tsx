import { FiMaximize2, FiMinimize2, FiMinus, FiX } from 'react-icons/fi';
import { useEffect, useState } from 'react';

import { Button, useClientContext } from '@wowarenalogs/shared';
import styles from './index.module.css';
import { flushSync } from 'react-dom';

function TitleBar() {
  const clientContext = useClientContext();
  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
    window.wowarenalogs.win?.isMaximized().then((value) => {
      setIsMaximized(value);
    });
  }, []);

  return (
    <div className="flex flex-row item-center fixed top-0 left-0 right-0 z-50">
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
            const pos = (await window.wowarenalogs.win?.getWindowPosition()) || [];
            const size = (await window.wowarenalogs.win?.getWindowSize()) || [];
            if (pos.length > 1 && size.length > 1) {
              clientContext.updateAppConfig((prev) => ({
                ...prev,
                lastWindowWidth: size[0],
                lastWindowHeight: size[1],
                lastWindowX: pos[0],
                lastWindowY: pos[1],
              }));
            }
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
