import { EquippedItem } from '@wowarenalogs/parser';
import { useEffect } from 'react';

import { enchantsMap } from '../../data/enchantsMap';

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

export const EquipmentInfo = ({ item, size = 'large', notext = false, bonusOnly = false }: IProps) => {
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

  if (!item?.id) {
    return null;
  }
  if (item.id === '0') {
    return null;
  }

  let enchantAnnotation = '';
  item.enchants.map((b) => {
    if (b !== '0') {
      if (b in enchantsMap) {
        enchantAnnotation = enchantsMap[b].itemName || enchantsMap[b].displayName;
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
    <div className="flex flex-row items-center">
      <a
        href={`https://www.wowhead.com/item=${item.id}&bonus=${item.bonuses
          .filter((b) => b && b !== '0')
          .join(':')}&gems=${item.gems.filter((_g, i) => i % 2 === 0).join(':')}&ench=${item.enchants
          .filter((e) => e)
          .join(':')}`}
        data-wh-icon-size={size || 'large'}
        data-wh-rename-link="false"
        onClick={(e) => {
          e.preventDefault();
        }}
      ></a>
      <div>
        <a
          href={`https://www.wowhead.com/item=${item.id}&bonus=${item.bonuses
            .filter((b) => b && b !== '0')
            .join(':')}&gems=${item.gems.filter((_g, i) => i % 2 === 0).join(':')}&ench=${item.enchants
            .filter((e) => e)
            .join(':')}`}
          data-wh-rename-link={bonusOnly || notext ? 'false' : 'true'}
          onClick={(e) => {
            e.preventDefault();
          }}
        ></a>
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
            .filter((_g, i) => i % 2 === 0)
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
                Loading
              </a>
            ))}
      </div>
    </div>
  );
};
