import { CloseOutlined, CompressOutlined, ExpandOutlined, MinusOutlined, SettingOutlined } from '@ant-design/icons';
import { Box } from '@wowarenalogs/shared';
import { Button } from 'antd';
// import { remote } from 'electron';
import Link from 'next/link';
import { useState } from 'react';

import styles from './index.module.css';

function TitleBar() {
  const [isMaximized, setIsMaximized] = useState(false); ///useState(remote.getCurrentWindow().isMaximized());

  return (
    <Box className={styles['title-bar']} display="flex" flexDirection="row" alignItems="center">
      <div className={styles['titlebar-drag-region']}></div>
      <Box className={styles['title-bar-logo']} />
      <Box flex={1} />
      <Box className={styles['title-bar-buttons']} display="flex" flexDirection="row">
        <Link href="/settings">
          <Button type="text" icon={<SettingOutlined />} />
        </Link>
        <Button
          type="text"
          icon={<MinusOutlined />}
          onClick={() => {
            // remote.getCurrentWindow().minimize();
          }}
        />
        <Button
          type="text"
          icon={isMaximized ? <CompressOutlined /> : <ExpandOutlined />}
          onClick={() => {
            if (isMaximized) {
              // remote.getCurrentWindow().unmaximize();
              setIsMaximized(false);
            } else {
              // remote.getCurrentWindow().maximize();
              setIsMaximized(true);
            }
          }}
        />
        <Button
          type="text"
          icon={<CloseOutlined />}
          onClick={() => {
            // remote.app.exit(0);
          }}
        />
      </Box>
    </Box>
  );
}

export default TitleBar;
