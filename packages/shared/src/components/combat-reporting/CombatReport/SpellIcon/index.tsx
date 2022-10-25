import { Box } from '../../../common/Box';
import { useCombatReportContext } from '../CombatReportContext';

interface IProps {
  spellId: string;
  size: number;
  className?: string;
  charges?: number;
  cooldownPercent?: number;
  circular?: boolean;
}

export function SpellIcon(props: IProps) {
  const combatReportContext = useCombatReportContext();
  // assuming 0 = auto attack
  const spellId = props.spellId === '0' ? '6603' : props.spellId;

  return (
    <Box
      className={props.className}
      borderRadius={props.circular ? props.size / 2 : 4}
      width={props.size}
      height={props.size}
      bgcolor={'black'}
      border="solid 1px rgba(255, 255, 255, 0.45)"
      overflow="hidden"
    >
      <a
        style={{
          position: 'relative',
          top: -1,
          left: -1,
          width: props.size,
          height: props.size,
        }}
        href={`https://${
          combatReportContext.combat?.wowVersion === 'dragonflight' ? 'www' : 'tbc'
        }.wowhead.com/spell=${spellId}`}
        onClick={(e) => {
          e.preventDefault();
        }}
      >
        {props.charges && (
          <div
            style={{
              position: 'absolute',
              textShadow: '1px 1px #000000',
              color: 'white',
              bottom: -8,
              right: 2,
              margin: 0,
              padding: 0,
            }}
          >
            {props.charges}
          </div>
        )}
        {props.cooldownPercent && (
          <div
            style={{
              position: 'absolute',
              display: 'inline-block',
              float: 'left',
              height: props.size,
              width: props.size,
              backgroundColor: 'black',
              top: props.cooldownPercent * props.size,
              opacity: '80%',
            }}
          />
        )}
        <img
          alt=""
          src={`https://images.wowarenalogs.com/spells/${spellId}.jpg`}
          width={props.size}
          height={props.size}
        />
      </a>
    </Box>
  );
}
