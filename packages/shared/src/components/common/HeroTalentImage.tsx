import Image from 'next/image';

export function HeroTalentImage({
  atlasMemberName,
  circle,
  size,
  name,
}: {
  atlasMemberName?: string;
  name?: string;
  circle?: boolean;
  size?: number;
}) {
  const height = size || 24;

  const style = circle
    ? {
        height,
        width: height,
        borderRadius: height / 2,
        border: '1px solid #6b7280',
        overflow: 'hidden',
        display: 'flex',
      }
    : {
        height,
        width: height,
        display: 'flex',
      };

  return (
    <div style={style}>
      <Image
        src={
          atlasMemberName
            ? `https://images.wowarenalogs.com/specs/${atlasMemberName}.png`
            : 'data:image/png;base64, iVBORw0KGgoAAAANSUhEUgAAAAUAAAAFCAQAAAAnZu5uAAAAEElEQVR42mNk+M8ABYwkMAGbQQUBEvGWBAAAAABJRU5ErkJggg=='
        }
        width={height}
        height={height}
        alt={name || 'Hero Talent Image'}
        title={name || 'Hero Talent Image'}
      />
    </div>
  );
}
