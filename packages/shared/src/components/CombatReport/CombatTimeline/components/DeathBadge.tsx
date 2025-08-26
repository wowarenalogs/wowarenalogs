interface IProps {
  deathCount: number;
  className?: string;
}

export const DeathBadge = ({ deathCount, className = '' }: IProps) => {
  if (deathCount === 0) return null;

  return (
    <span className={`badge badge-xs px-1 ${className}`} title="Died">
      💀
    </span>
  );
};
