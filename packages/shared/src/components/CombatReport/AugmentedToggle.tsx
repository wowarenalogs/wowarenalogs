import { ICombatUnit } from '@wowarenalogs/parser';

import { useCombatReportContext } from './CombatReportContext';

interface IProps {
  // Only show when an Augmentation Evoker is on this unit's team
  teamOf?: ICombatUnit;
}

export const AugmentedToggle = ({ teamOf }: IProps) => {
  const { combat, hasAugmentation, showAugmented, setShowAugmented } = useCombatReportContext();
  const visible =
    hasAugmentation &&
    (!teamOf ||
      Object.values(combat?.units ?? {}).some(
        (u) =>
          u.reaction === teamOf.reaction &&
          (u.supportDamageOut?.length || u.supportHealOut?.length || u.supportAbsorbOut?.length),
      ));
  if (!visible) {
    return null;
  }
  return (
    <button
      type="button"
      className={`btn btn-xs min-h-0 h-6 px-2 normal-case font-normal ${
        showAugmented ? 'btn-primary' : 'btn-outline border-base-content/40 text-base-content'
      }`}
      title="Leave the Augmentation Evoker's buff contributions on the players they buffed"
      onClick={() => setShowAugmented(!showAugmented)}
    >
      Augmented
    </button>
  );
};
