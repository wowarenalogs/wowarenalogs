// @inlet/react-pixi was designed for React 17 where React.FC implicitly included
// the children prop. React 18 removed this. This file re-exports Container with
// children properly typed, since the pixi reconciler does support children at runtime.
import { Container as BaseContainer } from '@inlet/react-pixi';
import type { ComponentProps, FC, PropsWithChildren } from 'react';

type ContainerProps = PropsWithChildren<ComponentProps<typeof BaseContainer>>;

export const Container = BaseContainer as FC<ContainerProps>;
