export type Bracket = '2v2' | '3v3' | 'Rated Solo Shuffle';

const bracketOptions: Bracket[] = ['2v2', '3v3', 'Rated Solo Shuffle', 'AWC 3v3'];

export function BracketSelector({ bracket, setBracket }: { bracket: Bracket; setBracket: (b: Bracket) => void }) {
  return (
    <div className="flex flex-row space-x-8 mb-2">
      <div className="flex flex-col">
        <div className="font-semibold text-info-content opacity-50 mt-[5px] mb-[-5px]">LADDER</div>
        <div className="flex flex-row space-x-4 m-0 p-0 items-center">
          {bracketOptions.map((o) => {
            return (
              <div className="form-control" key={o}>
                <label className="label cursor-pointer space-x-2">
                  <input
                    type="radio"
                    name="radio-10"
                    className="radio checked:bg-primary"
                    onClick={() => setBracket(o)}
                    defaultChecked={bracket === o}
                  />
                  <span className="label-text">{o}</span>
                </label>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
