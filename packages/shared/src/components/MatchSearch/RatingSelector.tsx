const ratingOptions = [1400, 1800, 2100];

export function RatingSelector({ minRating, setMinRating }: { minRating: number; setMinRating: (r: number) => void }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="mt-[5px] font-semibold text-info-content opacity-50">RATING</div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <div className="form-control">
          <label className="label cursor-pointer gap-2 px-0 py-1">
            <input
              type="radio"
              name="radio-11"
              className="radio checked:bg-primary"
              onChange={() => setMinRating(0)}
              checked={minRating === 0}
            />
            <span className="label-text">Any</span>
          </label>
        </div>
        {ratingOptions.map((o) => {
          return (
            <div className="form-control" key={o}>
              <label className="label cursor-pointer gap-2 px-0 py-1">
                <input
                  type="radio"
                  name="radio-11"
                  className="radio checked:bg-primary"
                  onChange={() => setMinRating(o)}
                  checked={minRating === o}
                />
                <span className="label-text">{o}+</span>
              </label>
            </div>
          );
        })}
      </div>
    </div>
  );
}
