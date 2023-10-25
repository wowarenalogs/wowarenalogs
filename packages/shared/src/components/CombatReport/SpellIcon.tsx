import Image from 'next/image';

interface IProps {
  spellId: string | number;
  size: number;
  className?: string;
  charges?: number;
  cooldownPercent?: number;
  circular?: boolean;
  opacity?: number;
}

export function SpellIcon(props: IProps) {
  // assuming 0 = auto attack
  const spellId =
    props.spellId === '0' || props.spellId === 0 || props.spellId === 'null' || props.spellId === null
      ? '6603'
      : props.spellId;

  return (
    <div
      className={`${props.className} bg-black overflow-hidden border-solid border border-opacity-60`}
      style={{
        width: props.size,
        height: props.size,
        borderRadius: props.circular ? props.size / 2 : 4,
        opacity: props.className ? undefined : props.opacity || 1,
      }}
    >
      <a
        className="relative"
        style={{
          width: props.size,
          height: props.size,
        }}
        href={`https://www.wowhead.com/spell=${spellId}`}
        onClick={(e) => {
          e.preventDefault();
        }}
      >
        {props.charges && (
          <div
            className="absolute text-white m-0 p-0"
            style={{
              zIndex: 8,
              textShadow: '1px 1px #000000',
              bottom: -1,
              right: 2,
            }}
          >
            {props.charges}
          </div>
        )}
        {props.cooldownPercent && (
          <div
            className="absolute inline-block float-left bg-black opacity-80 z-10"
            style={{
              height: props.size,
              width: props.size,
              top: props.cooldownPercent * props.size - 8,
            }}
          />
        )}
        <Image
          alt=""
          src={`https://images.wowarenalogs.com/spells/${spellId}.jpg`}
          width={props.size}
          height={props.size}
        />
      </a>
    </div>
  );
}
