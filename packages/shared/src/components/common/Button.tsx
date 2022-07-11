import React from 'react';

export const Button = (props: React.PropsWithChildren<{}> & React.HTMLAttributes<HTMLButtonElement>) => {
  return (
    <button
      className="flex flex-row item-center justify-center bg-transparent text-zinc-500 hover:text-white hover:bg-zinc-900 p-2"
      {...props}
    >
      {props.children}
    </button>
  );
};
