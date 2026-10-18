import { useCombatReportContext } from './CombatReportContext';

export const AugmentedToggle = () => {
  const { hasAugmentation, showAugmented, setShowAugmented } = useCombatReportContext();
  if (!hasAugmentation) {
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
