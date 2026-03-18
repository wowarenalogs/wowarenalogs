const ratingOptions = [1400, 1800, 2100];

export function RatingSelector({ minRating, setMinRating }: { minRating: number; setMinRating: (r: number) => void }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="font-semibold text-[10px] uppercase tracking-wide text-info-content opacity-50 sm:mt-[5px] sm:text-base sm:normal-case sm:tracking-normal">
        Rating
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 sm:gap-x-4 sm:gap-y-1">
        <div className="form-control">
          <label className="label cursor-pointer gap-1.5 px-0 py-0.5 sm:gap-2 sm:py-1">
            <input
              type="radio"
              name="radio-11"
              className="radio h-3.5 w-3.5 checked:bg-primary sm:h-4 sm:w-4"
              onChange={() => setMinRating(0)}
              checked={minRating === 0}
            />
            <span className="label-text text-xs sm:text-sm">Any</span>
          </label>
        </div>
        {ratingOptions.map((o) => {
          return (
            <div className="form-control" key={o}>
              <label className="label cursor-pointer gap-1.5 px-0 py-0.5 sm:gap-2 sm:py-1">
                <input
                  type="radio"
                  name="radio-11"
                  className="radio h-3.5 w-3.5 checked:bg-primary sm:h-4 sm:w-4"
                  onChange={() => setMinRating(o)}
                  checked={minRating === o}
                />
                <span className="label-text text-xs sm:text-sm">{o}+</span>
              </label>
            </div>
          );
        })}
      </div>
    </div>
  );
}
