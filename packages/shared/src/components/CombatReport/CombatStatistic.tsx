interface IProps {
  value: number | string;
  title: string;
  valueColor?: '' | 'text-primary' | 'text-success' | 'text-error' | 'text-info';
}

export function CombatStatistic({ value, title, valueColor }: IProps) {
  return (
    <div className="stat">
      <div className="stat-title">{title}</div>
      <div className={`stat-value ${valueColor ?? ''}`}>{value}</div>
    </div>
  );
}
