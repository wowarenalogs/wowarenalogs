import { CombatUnitSpec } from '@wowarenalogs/parser';
import { useReplaySettings } from '@wowarenalogs/shared';
import { SpellIcon } from '@wowarenalogs/shared/src/components/CombatReport/SpellIcon';
import { SpecImage } from '@wowarenalogs/shared/src/components/common/SpecImage';
import { awcSpells } from '@wowarenalogs/shared/src/data/awcSpells';
import { Utils } from '@wowarenalogs/shared/src/utils/utils';
import { useCallback, useState } from 'react';

const specIds = Object.keys(awcSpells).filter((a) => a != '0');

export const Editor = () => {
  const awcProvider = useReplaySettings();
  const allAWCS = awcProvider.replaySettings.awcSpellIds;

  const [spellIdForModal, setSpellIdForModal] = useState('');
  const [spellIdToAdd, setSpellIdToAdd] = useState('0');

  const [selectedSpecId, setSelectedSpecId] = useState('65');
  const awcs = allAWCS ? allAWCS[selectedSpecId as CombatUnitSpec] : [];

  const removeSpell = useCallback(() => {
    awcProvider.removeSpell(selectedSpecId as CombatUnitSpec, spellIdForModal.trim());
  }, [awcProvider, selectedSpecId, spellIdForModal]);

  const addSpell = useCallback(() => {
    awcProvider.addSpell(selectedSpecId as CombatUnitSpec, spellIdToAdd.trim());
  }, [awcProvider, selectedSpecId, spellIdToAdd]);

  return (
    <div className="p-4 max-w-3xl">
      <div className="text-xl font-bold">Replay Spell Cooldown Display Editor</div>
      <div>This page allows you to edit which spells appear as cooldowns on replays for each spec.</div>
      <div className=" ml-2 mt-4">
        <div className="flex flex-row flex-wrap gap-1">
          {specIds.map((specId) => (
            <div
              key={specId}
              className={selectedSpecId === specId ? 'border-2 ml-2 mr-2' : ''}
              onClick={() => {
                setSelectedSpecId(specId);
              }}
            >
              <SpecImage specId={specId} size={32} />
            </div>
          ))}
        </div>
        <div className="flex flex-row items-center gap-1 mt-4">
          <SpecImage specId={selectedSpecId} size={44} />
          <div className="text-lg font-bold">{Utils.getSpecName(selectedSpecId as CombatUnitSpec)}</div>
        </div>
        <div className="flex flex-row gap-1 mt-4 flex-wrap gap-y-3">
          {awcs.map((a) => (
            <div className="flex items-center flex-col" key={a}>
              <SpellIcon spellId={a} size={32} />
              <label
                htmlFor="confirm-edit-modal"
                className="btn"
                onClick={() => {
                  setSpellIdForModal(a);
                }}
              >
                remove
              </label>
            </div>
          ))}
        </div>
        <div className="flex flex-row items-center gap-2 mt-4">
          <div>Add Spell:</div>
          <SpellIcon spellId={spellIdToAdd} size={32} />
          <input
            type="text"
            placeholder="Type here"
            className="input input-sm input-bordered flex-1"
            onChange={(e) => setSpellIdToAdd(e.target.value.trim())}
          />
          <button className="btn btn-sm btn-outline" onClick={addSpell}>
            add
          </button>
        </div>
      </div>

      <div className="mt-4">
        <label htmlFor="confirm-reset-modal" className="btn btn-outline btn-error">
          Reset to defaults
        </label>
      </div>

      <input type="checkbox" id="confirm-reset-modal" className="modal-toggle" />
      <div className="modal">
        <div className="modal-box">
          <h3 className="font-bold text-lg">
            Reset ALL spell display settings to defaults?
            <br />
            This cannot be undone!
          </h3>
          <div className="modal-action">
            <label
              htmlFor="confirm-reset-modal"
              className="btn btn-success"
              onClick={() => awcProvider.resetToDefaults()}
            >
              Confirm
            </label>
            <label htmlFor="confirm-reset-modal" className="btn btn-error">
              Nevermind
            </label>
          </div>
        </div>
      </div>

      <input type="checkbox" id="confirm-edit-modal" className="modal-toggle" />
      <div className="modal">
        <div className="modal-box">
          <h3 className="font-bold text-lg">
            Remove {spellIdForModal} from {Utils.getSpecName(selectedSpecId as CombatUnitSpec)} spells.
          </h3>
          <SpellIcon spellId={spellIdForModal} size={32} />
          <p className="py-4">Are you sure?</p>
          <div className="modal-action">
            <label htmlFor="confirm-edit-modal" className="btn btn-success" onClick={removeSpell}>
              Confirm
            </label>
            <label htmlFor="confirm-edit-modal" className="btn btn-error">
              Nevermind
            </label>
          </div>
        </div>
      </div>
    </div>
  );
};
