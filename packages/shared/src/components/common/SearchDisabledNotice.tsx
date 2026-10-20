import { TbRocketOff } from 'react-icons/tb';

import { SEARCH_DISABLED_MESSAGE, SEARCH_DISABLED_TITLE } from '../../utils/searchStatus';

export function SearchDisabledNotice() {
  return (
    <div className="alert alert-warning shadow-lg animate-fadein">
      <TbRocketOff size={28} className="shrink-0" />
      <div>
        <h3 className="font-bold">{SEARCH_DISABLED_TITLE}</h3>
        <div className="text-sm">{SEARCH_DISABLED_MESSAGE}</div>
      </div>
    </div>
  );
}
