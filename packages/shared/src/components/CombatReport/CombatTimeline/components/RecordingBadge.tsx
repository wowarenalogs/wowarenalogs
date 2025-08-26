interface IProps {
  className?: string;
}

export const RecordingBadge = ({ className = '' }: IProps) => {
  return (
    <span className={`badge badge-xs badge-primary ${className}`} title="Recording Player">
      R
    </span>
  );
};


