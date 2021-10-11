import { Tooltip } from 'antd';
import React from 'react';

interface IProps {
  className?: string;
  display?: string;
  flex?: number | string;
  flexWrap?: string;
  flexDirection?: 'row' | 'column' | 'row-reverse' | 'column-reverse';
  alignItems?: string;
  justifyContent?: string;
  position?: string;
  m?: number;
  mx?: number;
  my?: number;
  mt?: number;
  mb?: number;
  ml?: number;
  mr?: number;
  p?: number;
  px?: number;
  py?: number;
  pt?: number;
  pb?: number;
  pl?: number;
  pr?: number;
  width?: number;
  height?: number;
  textAlign?: string;
  borderRadius?: number;
  bgcolor?: string;
  border?: string;
  overflow?: string;
  title?: string;
  style?: React.CSSProperties;
  children?: React.ReactNodeArray | React.ReactNode;
  onClick?: React.MouseEventHandler<HTMLDivElement>;
  onMouseOver?: React.MouseEventHandler<HTMLDivElement>;
  onMouseEnter?: React.MouseEventHandler<HTMLDivElement>;
  onMouseLeave?: React.MouseEventHandler<HTMLDivElement>;
  onMouseMove?: React.MouseEventHandler<HTMLDivElement>;
  onMouseOut?: React.MouseEventHandler<HTMLDivElement>;
  onDrop?: React.DragEventHandler<HTMLDivElement>;
  onDragOver?: React.DragEventHandler<HTMLDivElement>;
  onDragEnter?: React.DragEventHandler<HTMLDivElement>;
  onDragLeave?: React.DragEventHandler<HTMLDivElement>;
}

export function Box(props: IProps) {
  const style: Record<string, unknown> = {
    display: props.display,
    flex: props.flex,
    flexDirection: props.flexDirection,
    flexWrap: props.flexWrap,
    alignItems: props.alignItems,
    justifyContent: props.justifyContent,
    position: props.position,
    margin: props.m ? `${props.m * 4}px` : undefined,
    marginLeft: props.ml ? `${props.ml * 4}px` : props.mx ? `${props.mx * 4}px` : undefined,
    marginRight: props.mr ? `${props.mr * 4}px` : props.mx ? `${props.mx * 4}px` : undefined,
    marginTop: props.mt ? `${props.mt * 4}px` : props.my ? `${props.my * 4}px` : undefined,
    marginBottom: props.mb ? `${props.mb * 4}px` : props.my ? `${props.my * 4}px` : undefined,
    paddingLeft: props.pl ? `${props.pl * 4}px` : props.px ? `${props.px * 4}px` : undefined,
    paddingRight: props.pr ? `${props.pr * 4}px` : props.px ? `${props.px * 4}px` : undefined,
    paddingTop: props.pt ? `${props.pt * 4}px` : props.py ? `${props.py * 4}px` : undefined,
    paddingBottom: props.pb ? `${props.pb * 4}px` : props.py ? `${props.py * 4}px` : undefined,
    padding: props.p ? `${props.p * 4}px` : undefined,
    textAlign: props.textAlign,
    borderRadius: props.borderRadius,
    backgroundColor: props.bgcolor,
    border: props.border,
    overflow: props.overflow,
    width: props.width,
    height: props.height,
    ...props.style,
  };

  Object.keys(style).forEach((key) => style[key] === undefined && delete style[key]);

  const div = (
    <div
      className={props.className}
      style={style}
      onClick={props.onClick}
      onMouseOver={props.onMouseOver}
      onMouseEnter={props.onMouseEnter}
      onMouseLeave={props.onMouseLeave}
      onMouseMove={props.onMouseMove}
      onMouseOut={props.onMouseOut}
      onDrop={props.onDrop}
      onDragEnter={props.onDragEnter}
      onDragLeave={props.onDragLeave}
      onDragOver={props.onDragOver}
    >
      {props.children}
    </div>
  );

  if (props.title) {
    return <Tooltip title={props.title}>{div}</Tooltip>;
  }
  return div;
}
