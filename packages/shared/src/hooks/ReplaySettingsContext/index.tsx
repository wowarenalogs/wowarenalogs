import { CombatUnitSpec } from '@wowarenalogs/parser';
import { awcSpells } from '@wowarenalogs/shared/src/data/awcSpells';
import _ from 'lodash';
import React, { useCallback, useContext, useEffect, useState } from 'react';

const defaultAwcSpells = _.cloneDeep(awcSpells);
const REPLAY_SETTINGS_STORAGE_KEY = '@wowarenalogs/replayConfig/v0';

export interface IReplaySettings {
  awcSpellIds?: Record<CombatUnitSpec, string[]>;
}

interface IReplaySettingsContextData {
  isLoading: boolean;
  replaySettings: IReplaySettings;
  removeSpell: (specId: CombatUnitSpec, spellId: string) => void;
  addSpell: (specId: CombatUnitSpec, spellId: string) => void;
  resetToDefaults: () => void;
}

const ReplaySettingsContext = React.createContext<IReplaySettingsContextData>({
  isLoading: true,
  replaySettings: {},
  removeSpell: (_specId: CombatUnitSpec, _spellId: string) => null,
  addSpell: (_specId: CombatUnitSpec, _spellId: string) => null,
  resetToDefaults: () => null,
});

interface IProps {
  children: React.ReactNode | React.ReactNode[];
}

export const ReplaySettingsProvider = (props: IProps) => {
  const [replaySettings, setReplaySettings] = useState<IReplaySettings>({});
  const [isLoading, setLoading] = useState(true);

  const resetToDefaults = useCallback(() => {
    setReplaySettings({
      awcSpellIds: defaultAwcSpells,
    });
  }, []);

  const removeSpell = useCallback(
    (specId: CombatUnitSpec, spellId: string) => {
      if (!replaySettings.awcSpellIds) {
        throw new Error('Replay settings data corrupted');
      }
      const newSpellIds: Record<CombatUnitSpec, string[]> = { ...replaySettings.awcSpellIds };
      newSpellIds[specId] = newSpellIds[specId].filter((a) => a != spellId);

      const newSettings = {
        awcSpellIds: newSpellIds,
      };

      localStorage.setItem(REPLAY_SETTINGS_STORAGE_KEY, JSON.stringify(newSettings));
      setReplaySettings(newSettings);
    },
    [replaySettings.awcSpellIds],
  );

  const addSpell = useCallback(
    (specId: CombatUnitSpec, spellId: string) => {
      if (!replaySettings.awcSpellIds) {
        throw new Error('Replay settings data corrupted');
      }

      const newSpellIds: Record<CombatUnitSpec, string[]> = { ...replaySettings.awcSpellIds };
      if (!newSpellIds[specId].includes(spellId)) {
        newSpellIds[specId] = [...newSpellIds[specId], spellId];
      }

      const newSettings = {
        awcSpellIds: newSpellIds,
      };

      console.log(`addSpell ${specId} ${spellId}`, newSettings);
      localStorage.setItem(REPLAY_SETTINGS_STORAGE_KEY, JSON.stringify(newSettings));
      setReplaySettings(newSettings);
    },
    [replaySettings.awcSpellIds],
  );

  useEffect(() => {
    const loadFromStorage = async () => {
      const appConfigJson = localStorage.getItem(REPLAY_SETTINGS_STORAGE_KEY);
      if (appConfigJson) {
        const storedConfig = JSON.parse(appConfigJson) as IReplaySettings;

        const newState = {
          awcSpellIds: storedConfig.awcSpellIds || awcSpells,
        };
        setReplaySettings(newState);
      } else {
        setReplaySettings({
          awcSpellIds: awcSpells,
        });
      }
      setLoading(false);
    };
    loadFromStorage();
  }, []);

  return (
    <ReplaySettingsContext.Provider
      value={{
        isLoading,
        replaySettings,
        addSpell,
        removeSpell,
        resetToDefaults,
      }}
    >
      {props.children}
    </ReplaySettingsContext.Provider>
  );
};

export const useReplaySettings = () => {
  return useContext(ReplaySettingsContext);
};
