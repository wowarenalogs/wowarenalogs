import { useEffect } from 'react';

export default function IndexHtml() {
  useEffect(() => {
    window.location.replace('/');
  });

  return <div />;
}
