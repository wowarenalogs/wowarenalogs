import Image from 'next/image';

export function SpecImage({ specId, circle, size }: { specId?: string | number; circle?: boolean; size?: number }) {
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
          specId
            ? `https://images.wowarenalogs.com/specs/${specId}.jpg`
            : 'data:image/png;base64, iVBORw0KGgoAAAANSUhEUgAAAAUAAAAFCAQAAAAnZu5uAAAAEElEQVR42mNk+M8ABYwkMAGbQQUBEvGWBAAAAABJRU5ErkJggg=='
        }
        blurDataURL={
          'data:image/png;base64, iVBORw0KGgoAAAANSUhEUgAAAAUAAAAFCAQAAAAnZu5uAAAAEElEQVR42mNk+M8ABYwkMAGbQQUBEvGWBAAAAABJRU5ErkJggg=='
        }
        placeholder={'blur'}
        width={height}
        height={height}
        alt={'specimage'}
      />
    </div>
  );
}
