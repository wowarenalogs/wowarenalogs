import { useClientContext } from '../../hooks/ClientContext';
import { canUseFeature, features } from '../../utils/featureFlags';

export type Bracket = '2v2' | '3v3' | 'Rated Solo Shuffle' | 'AWC 3v3';

const bracketOptions: Bracket[] = ['2v2', '3v3', 'Rated Solo Shuffle'];
const allBracketOptions: Bracket[] = ['2v2', '3v3', 'Rated Solo Shuffle', 'AWC 3v3'];

export function BracketSelector({ bracket, setBracket }: { bracket: Bracket; setBracket: (b: Bracket) => void }) {
  const clientCtx = useClientContext();
  const brackets = canUseFeature(features.awcSearch, null, clientCtx.localFlags) ? allBracketOptions : bracketOptions;
  return (
    <div>
      <div className="flex flex-col gap-1">
        <div className="font-semibold text-[10px] uppercase tracking-wide text-info-content opacity-50 sm:mt-[5px] sm:text-base sm:normal-case sm:tracking-normal">
          Ladder
        </div>
        <div className="m-0 flex flex-wrap items-center gap-x-3 gap-y-0.5 p-0 sm:gap-x-4 sm:gap-y-1">
          {brackets.map((o) => {
            return (
              <div className="form-control" key={o}>
                <label className="label cursor-pointer gap-1.5 px-0 py-0.5 sm:gap-2 sm:py-1">
                  <input
                    type="radio"
                    name="radio-10"
                    className="radio h-3.5 w-3.5 checked:bg-primary sm:h-4 sm:w-4"
                    onChange={() => setBracket(o)}
                    checked={bracket === o}
                  />
                  <span className="label-text text-xs sm:text-sm">{o}</span>
                </label>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
