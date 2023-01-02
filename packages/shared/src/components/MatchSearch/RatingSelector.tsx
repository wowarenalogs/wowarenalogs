const ratingOptions = [1400, 1800, 2100];

export function RatingSelector({ minRating, setMinRating }: { minRating: number; setMinRating: (r: number) => void }) {
  return (
    <div>
      <div className="font-semibold text-info-content opacity-50 mt-[5px] mb-[-5px]">RATING</div>
      <div className="flex flex-row space-x-4 items-center">
        <div className="form-control">
          <label className="label cursor-pointer space-x-2">
            <input
              type="radio"
              name="radio-11"
              className="radio checked:bg-primary"
              onClick={() => setMinRating(0)}
              defaultChecked={minRating === 0}
            />
            <span className="label-text">Any</span>
          </label>
        </div>
        {ratingOptions.map((o) => {
          return (
            <div className="form-control" key={o}>
              <label className="label cursor-pointer space-x-2">
                <input
                  type="radio"
                  name="radio-11"
                  className="radio checked:bg-primary"
                  onClick={() => setMinRating(o)}
                  defaultChecked={minRating === o}
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
