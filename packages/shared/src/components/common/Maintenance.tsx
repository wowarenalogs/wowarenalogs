import { Result } from 'antd';

export function Maintenance() {
  return (
    <div style={{
      width: '100vw',
      height: '100vh',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
    }}>
      <Result
        status="warning"
        title="Maintenance"
        subTitle="We are getting things ready for Dragonflight! Please check back again later."
      />
    </div>
  );
}
