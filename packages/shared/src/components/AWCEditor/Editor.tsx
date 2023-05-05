import { CombatUnitSpec } from '@wowarenalogs/parser';
import { useCallback, useState } from 'react';

import { awcSpells } from '../../data/awcSpells';
import { Utils } from '../../utils/utils';
import { SpellIcon } from '../CombatReport/SpellIcon';
import { SpecImage } from '../common/SpecImage';

const specIds = Object.keys(awcSpells).filter((a) => a != '0');

/**
 * mock impl until storage decided
 */
const useAWCProvider = () => {
  const [spellIds, setSpellIds] = useState(awcSpells);
  return {
    spellIds,
    removeSpellId: (specId: CombatUnitSpec, spellId: string) => {
      const newSpellIds = { ...spellIds };
      newSpellIds[specId] = newSpellIds[specId].filter((a) => a != spellId);
      setSpellIds(newSpellIds);
    },
    addSpellId: (specId: CombatUnitSpec, spellId: string) => {
      const newSpellIds = { ...spellIds };
      if (!newSpellIds[specId].includes(spellId)) {
        newSpellIds[specId] = [...newSpellIds[specId], spellId];
      }
      setSpellIds(newSpellIds);
    },
  };
};

export const Editor = () => {
  const awcProvider = useAWCProvider();
  const allAWCS = awcProvider.spellIds;

  const [spellIdForModal, setSpellIdForModal] = useState('');
  const [spellIdToAdd, setSpellIdToAdd] = useState('0');

  const [selectedSpecId, setSelectedSpecId] = useState('65');
  const awcs = allAWCS[selectedSpecId as CombatUnitSpec];

  const removeSpell = useCallback(() => {
    awcProvider.removeSpellId(selectedSpecId as CombatUnitSpec, spellIdForModal.trim());
  }, [awcProvider, selectedSpecId, spellIdForModal]);

  const addSpell = useCallback(() => {
    awcProvider.addSpellId(selectedSpecId as CombatUnitSpec, spellIdToAdd.trim());
  }, [awcProvider, selectedSpecId, spellIdToAdd]);

  return (
    <div className="p-4">
      <div className="text-xl font-bold">Replay Spell Cooldown Display Editor</div>
      <div>This page allows you to edit which spells appear as cooldowns on replays for each spec.</div>
      <div className=" ml-2 mt-4">
        <div className="flex flex-row flex-wrap max-w-xl gap-1">
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
        <div className="flex flex-row gap-1 mt-4 flex-wrap max-w-xl">
          {awcs.map((a) => (
            <div className="flex items-center flex-col" key={a}>
              <SpellIcon spellId={a} size={32} />
              <label
                htmlFor="my-modal"
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
        <div className="flex flex-row items-center gap-2 max-w-xl">
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
      <input type="checkbox" id="my-modal" className="modal-toggle" />
      <div className="modal">
        <div className="modal-box">
          <h3 className="font-bold text-lg">
            Remove {spellIdForModal} from {Utils.getSpecName(selectedSpecId as CombatUnitSpec)} spells.
          </h3>
          <SpellIcon spellId={spellIdForModal} size={32} />
          <p className="py-4">Are you sure?</p>
          <div className="modal-action">
            <label htmlFor="my-modal" className="btn btn-success" onClick={removeSpell}>
              Confirm
            </label>
            <label htmlFor="my-modal" className="btn btn-error">
              Nevermind
            </label>
          </div>
        </div>
      </div>
    </div>
  );
};
