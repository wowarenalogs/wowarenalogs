// Module augmentation for @inlet/react-pixi React 18 compatibility.
// In React 18, React.FC no longer implicitly includes children.
// This augmentation restores children support for pixi Container.
import type { ReactNode } from 'react';

declare module '@inlet/react-pixi' {
  const Container: React.FC<_ReactPixi.IContainer & { children?: ReactNode }>;
}
