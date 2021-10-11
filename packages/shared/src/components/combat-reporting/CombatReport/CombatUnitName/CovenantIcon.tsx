import { covenantMetadata } from 'wow-combat-log-parser';

interface IProps {
  covenantId: string;
  size: 'large' | 'small';
}

export function CovenantIcon({ size, covenantId }: IProps) {
  return (
    <img
      height={size === 'large' ? 36 : 20}
      width={size === 'large' ? 36 : 20}
      style={{ borderRadius: size === 'large' ? 18 : 10 }}
      alt={`${covenantMetadata[covenantId as '1' | '2' | '3' | '4'].name}`}
      title={`${covenantMetadata[covenantId as '1' | '2' | '3' | '4'].name}`}
      src={`https://images.wowarenalogs.com/covenants/cov${covenantId}.jpg`}
    />
  );
}
