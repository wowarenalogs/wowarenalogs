import _ from 'lodash';
import md5 from 'md5';
import { uniqueNamesGenerator, adjectives, colors, animals } from 'unique-names-generator';
import { v4 as uuidv4 } from 'uuid';

import { CombatUnitType } from '../../parser/dist/index';
import { FirebaseDTO } from './createMatchStub';

const WOW_MIN_NAME_LENGTH = 3;

function assertValidGuid(guid: string) {
  /*
  Make some simple assertions about guids we find in the log. If it looks unreasonable,
   we should abort writing the anonymous file since something is likely very broken
  */
  if (typeof guid !== 'string') {
    throw new Error(`Invalid Player Guid Found (type-rule): ${guid}`);
  }
  if (guid.length < 14) {
    throw new Error(`Invalid Player Guid Found (length-rule): ${guid}`);
  }
  if (!guid.startsWith('Player-')) {
    throw new Error(`Invalid Player Guid Found (prefix-rule): ${guid}`);
  }
}

export function applyCIIMap(line: string, ciiMap: Record<string, string>): string {
  let newLine = line.slice();
  _.keys(ciiMap).map((pubName) => {
    const pubNameRegex = new RegExp(pubName, 'g');
    newLine = newLine.replace(pubNameRegex, ciiMap[pubName]);
    return null;
  });
  return newLine;
}

function quoted(s: string): string {
  return '"' + s + '"';
}

export function anonymizeDTO(stub: FirebaseDTO) {
  // cii => "combatant identifying information" lul
  const ciiMap: Record<string, string> = {};

  for (const guid of stub.combatantGuids) {
    assertValidGuid(guid);
    ciiMap[guid] = uuidv4();
  }
  for (const unit of stub.units) {
    if (unit.type === CombatUnitType.Player) {
      ciiMap[quoted(unit.name)] = quoted(
        uniqueNamesGenerator({
          dictionaries: [adjectives, animals],
          length: 2,
          style: 'capital',
        }).replace('_', ''),
      );
    } else {
      if (ciiMap[quoted(unit.name)]) {
        // We've already chosen a name for this unit
        // Putting the check here guarantees we prefer players
        continue;
      }
      if (unit.name.length < WOW_MIN_NAME_LENGTH) {
        continue;
      }
      if (unit.name.search(' ') > -1) {
        // Player/pet names cannot have spaces
        continue;
      }
      if (unit.name === 'nil') {
        // Not sure where these are coming from but we def dont need to anon them
        continue;
      }
      ciiMap[quoted(unit.name)] = quoted(
        'NPC-' +
          uniqueNamesGenerator({
            dictionaries: [adjectives, colors],
            length: 2,
            style: 'capital',
          }).replace('_', ''),
      );
    }
  }

  const serializedDTO = applyCIIMap(JSON.stringify(stub), ciiMap);
  const anonStub = JSON.parse(serializedDTO) as FirebaseDTO;
  anonStub.id = md5(anonStub.id);
  anonStub.ownerId = 'anonymous';
  anonStub.logObjectUrl = '';

  return {
    ciiMap,
    anonymousStub: anonStub,
  };
}
