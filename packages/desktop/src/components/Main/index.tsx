import {
  Maintenance,
} from '@wowarenalogs/shared';

import 'antd/dist/antd.dark.css';

import TitleBar from '../../components/TitleBar';

export function Main() {
  return (
    <div id="desktop">
      <TitleBar />
      <Maintenance />
    </div>
  );
}
