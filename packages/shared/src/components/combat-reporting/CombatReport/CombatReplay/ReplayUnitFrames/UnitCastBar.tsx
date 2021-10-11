import { useTranslation } from 'next-i18next';

import styles from './UnitCastBar.module.css';

import { Utils } from '../../../../../utils';
import { IUnitFrameRenderData } from './UnitFrame';

const CAST_BAR_PROGRESS_COLOR = '#ffb200';
const CAST_BAR_SUCCESS_COLOR = '#49aa19';
const CAST_BAR_FAILURE_COLOR = '#a61d24';

export const UnitCastBar = (props: IUnitFrameRenderData) => {
  const { t } = useTranslation();

  if (!props.castingSpell) {
    return null;
  }

  return (
    <div
      className={styles['unit-frame-cast-bar-root']}
      style={{
        opacity: `${(props.castingSpell.casting ? 1 : 1 - props.castingSpell.progress).toFixed(2)}`,
      }}
    >
      <div
        className={styles['unit-frame-cast-bar-fill']}
        style={{
          backgroundColor: props.castingSpell.casting
            ? CAST_BAR_PROGRESS_COLOR
            : props.castingSpell.succeeded
            ? CAST_BAR_SUCCESS_COLOR
            : CAST_BAR_FAILURE_COLOR,
          width: `${((props.castingSpell.casting ? props.castingSpell.progress : 1) * 100).toFixed()}%`,
        }}
      />
      {props.castingSpell.casting || props.castingSpell.succeeded ? (
        <div
          title={t('combat-report-casting') + props.castingSpell.spellName}
          className={styles['unit-frame-cast-bar-icon']}
          style={{
            backgroundImage: `url(${Utils.getSpellIcon(props.castingSpell.spellId)})`,
          }}
        />
      ) : null}
    </div>
  );
};
