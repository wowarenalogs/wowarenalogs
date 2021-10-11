/* eslint-disable jsx-a11y/anchor-has-content */
import { useTranslation } from 'next-i18next';
import { useEffect } from 'react';
import { EquippedItem } from 'wow-combat-log-parser';

import { Box } from '../../../common/Box';
import legendaryData from './legendary-abilities.json';

const legendaryBonusMap = legendaryData.reduce((prev, cur, curIdx, ary) => {
  prev[`${cur.id_bonus}`] = cur.name;
  return prev;
}, {} as Record<string, string>);

const enchantsMap: Record<string, string> = {
  '6170': '+16 Versatility',
  '6229': 'Celestial Guidance',
  '6164': '+16 Critical Strike',
  '6166': '+16 Haste',
  '6168': '+16 Mastery',
  '6195': 'Infra-green Reflex Sight',
  '6211': '+15 Agility',
  '6210': '+15 Strength',
  '6220': '+15 Intellect',
  '6214': 'Eternal Skirmish',
  '6217': '+20 Intellect & +6% Mana',
  '6230': 'Primary Stats +30',
  '6213': '+25 Armor & +20 Primary Stat',
  '6265': 'Eternal Insight',
  '6216': 'Primary Stats +20',
  '6202': '+20 Stamina & Minor Speed Increase',
  '6208': '+30 Stamina',
  '6228': 'Sinful Revelation',
  '5400': 'Flametongue',
  '3370': 'Rune of Razorice',
  '6205': 'Shadowlands Gathering',
  '6203': '+20 Stamina & +30 Avoidance',
  '6222': 'Shaded Hearthing',
  '6204': '+20 Stamina & +30 Leech',
  '6207': 'Soul Treads',
  '4223': 'Nitro Boosts',
  '6226': 'Eternal Grace',
  '6192': 'Dimensional Shifter',
  '4897': 'Goblin Glider',
  '3368': 'Rune of the Fallen Crusader',
  '6165': '+12 Haste',
};

/*
States

notext=bonusOnly=false [default] - display item name, enchants, and gems
notext=true - display no text, icon only
bonusOnly=true - display item bonus name instead of item name, no other text
notext=true, bonusOnly=false - undefined state

*/
interface IProps {
  item?: EquippedItem;
  size?: 'small' | 'medium' | 'large';
  notext?: boolean;
  bonusOnly?: boolean;
}

export function EquipmentInfo({ item, size = 'large', notext = false, bonusOnly = false }: IProps) {
  // This hack is to make sure the wowhead powered <a> tooltips
  // load even when this component is rendered server-side
  useEffect(() => {
    try {
      // eslint-disable-next-line no-eval
      eval('$WowheadPower.refreshLinks()');
    } catch (e) {
      // oh well
    }
  }, []);

  const { t } = useTranslation();
  if (!item?.id) {
    return null;
  }
  if (item.id === '0') {
    return null;
  }

  let bonusAnnotation = '';
  item.bonuses.map((b) => {
    if (b in legendaryBonusMap) {
      bonusAnnotation = legendaryBonusMap[b];
    }
    return null;
  });

  let enchantAnnotation = '';
  item.enchants.map((b) => {
    if (b !== '0') {
      if (b in enchantsMap) {
        enchantAnnotation = enchantsMap[b];
      } else {
        enchantAnnotation = `Enchant ${b}`;
      }
    }
    return null;
  });

  const fontMap = {
    small: 10,
    medium: 12,
    large: 12,
  };
  const fontSize = fontMap[size];

  return (
    <Box display="flex" flexDirection={'row'} alignItems={'center'}>
      <a
        href={`https://www.wowhead.com/item=${item.id}&bonus=${item.bonuses
          .filter((b) => b && b !== '0')
          .join(':')}&gems=${item.gems.filter((g, i) => i % 2 === 0).join(':')}&ench=${item.enchants
          .filter((e) => e)
          .join(':')}`}
        data-wh-icon-size={size || 'large'}
        data-wh-rename-link="false"
        onClick={(e) => {
          e.preventDefault();
        }}
      ></a>
      <Box>
        <a
          href={`https://www.wowhead.com/item=${item.id}&bonus=${item.bonuses
            .filter((b) => b && b !== '0')
            .join(':')}&gems=${item.gems.filter((g, i) => i % 2 === 0).join(':')}&ench=${item.enchants
            .filter((e) => e)
            .join(':')}`}
          data-wh-rename-link={bonusOnly || notext ? 'false' : 'true'}
          onClick={(e) => {
            e.preventDefault();
          }}
        ></a>
        {!notext && (
          <div
            style={{
              fontSize,
              color: '#1eff00',
            }}
          >
            {bonusAnnotation}
          </div>
        )}
        {!notext && !bonusOnly && (
          <div
            style={{
              fontSize,
              color: '#1eff00',
            }}
          >
            {enchantAnnotation}
          </div>
        )}
        {!notext &&
          !bonusOnly &&
          item.gems
            .filter((g, i) => i % 2 === 0)
            .map((b) => (
              <a
                key={`${b}`}
                style={{
                  fontSize,
                }}
                data-wh-rename-link="true"
                onClick={(e) => {
                  e.preventDefault();
                }}
                href={`https://www.wowhead.com/item=${b}`}
              >
                {t('loading')}
              </a>
            ))}
      </Box>
    </Box>
  );
}
