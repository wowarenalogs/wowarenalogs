import { ICombatUnit, getClassColor, CombatUnitSpec } from 'wow-combat-log-parser';

import styles from './index.module.css';

import { Utils } from '../../../../utils';
import { Box } from '../../../common/Box';
import { useCombatReportContext } from '../CombatReportContext';
import { CovenantIcon } from './CovenantIcon';

interface IProps {
  unit: ICombatUnit;
  navigateToPlayerView?: boolean;
  isTitle?: boolean;
  showCovenant?: boolean;
  onClick?: () => void;
  showSpec?: boolean;
}

export function CombatUnitName({
  unit,
  navigateToPlayerView,
  isTitle,
  showCovenant,
  onClick,
  showSpec = true,
}: IProps) {
  const combatReportContext = useCombatReportContext();

  const shouldShowCov =
    showCovenant &&
    combatReportContext.combat?.wowVersion === 'shadowlands' &&
    unit.info?.covenantInfo.covenantId !== '0'; // It's possible to not have a covenant :\
  return (
    <Box
      display="flex"
      flex={isTitle ? 0 : 1}
      flexDirection="row"
      alignItems="center"
      onClick={() => {
        if (navigateToPlayerView) {
          combatReportContext.navigateToPlayerView(unit.id);
        }
        if (onClick) {
          onClick();
        }
      }}
      style={{
        cursor: navigateToPlayerView ? 'pointer' : undefined,
      }}
    >
      {showSpec && (
        <Box
          mr={1}
          className={isTitle ? styles['unit-name-spec-icon-large'] : styles['unit-name-spec-icon']}
          style={{
            backgroundImage:
              unit.spec === CombatUnitSpec.None
                ? `url(${Utils.getClassIcon(unit.class)})`
                : `url(${Utils.getSpecIcon(unit.spec)})`,
          }}
          title={unit.spec === CombatUnitSpec.None ? Utils.getClassName(unit.class) : Utils.getSpecName(unit.spec)}
        />
      )}
      {shouldShowCov && (
        <Box mr={1}>
          <CovenantIcon size={isTitle ? 'large' : 'small'} covenantId={unit.info?.covenantInfo.covenantId || ''} />
        </Box>
      )}
      <span
        className={isTitle ? styles['unit-name-title'] : styles['unit-name']}
        style={{ color: getClassColor(unit.class), maxWidth: isTitle ? 'unset' : 110 }}
      >
        {unit.name.split('-')[0]}
      </span>
    </Box>
  );
}
