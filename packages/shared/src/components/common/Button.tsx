import React from 'react';

export const Button = (props: React.PropsWithChildren<{}> & React.HTMLAttributes<HTMLButtonElement>) => {
  return (
    <button className="flex flex-row item-center justify-center bg-transparent hover:bg-gray-700 p-2" {...props}>
      {props.children}
    </button>
  );
};
