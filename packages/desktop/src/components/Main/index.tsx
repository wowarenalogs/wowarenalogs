import {
  Maintenance,
} from '@wowarenalogs/shared';

import 'antd/dist/antd.dark.css';
import { AppProps } from 'next/app';

import TitleBar from '../../components/TitleBar';

export function Main(_props: AppProps) {
  return (
    <div id="desktop">
      <TitleBar />
      <Maintenance />
    </div>
  );
}
