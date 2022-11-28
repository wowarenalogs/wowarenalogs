import { shell } from 'electron';
import { Button, Result } from 'antd';

export function Migration() {
  return (
    <div style={{
      width: '100vw',
      height: '100vh',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      alignItems: 'center',
    }}>
      <Result
        status="warning"
        title="Upgrade your app"
        subTitle="We are getting things ready for Dragonflight! Please check back again later."
      />
      <Button onClick={() => {
        shell.openExternal('https://wowarenalogs.com/');
      }}>Download</Button>
    </div>
  );
}
