import '@inlet/react-pixi';

// In React 18, React.FC no longer implicitly includes the children prop.
// @inlet/react-pixi was designed for React 17 where children was implicit.
// This augmentation restores children support for pixi components.
declare module '@inlet/react-pixi' {
  import { ReactNode } from 'react';

  export const Container: React.FC<_ReactPixi.IContainer & { children?: ReactNode }>;
}
