import _ from 'lodash';

import { CombatAbsorbAction } from './actions/CombatAbsorbAction';
import { CombatAction } from './actions/CombatAction';
import { CombatAdvancedAction } from './actions/CombatAdvancedAction';
import { CombatHpUpdateAction } from './actions/CombatHpUpdateAction';
import { CombatSupportAction } from './actions/CombatSupportAction';
import {
  CombatantInfo,
  CombatUnitAffiliation,
  CombatUnitClass,
  CombatUnitReaction,
  CombatUnitSpec,
  CombatUnitType,
  ILogLine,
} from './types';
import { getUnitAffiliation } from './utils';

export interface ICombatUnit {
  id: string;
  name: string;
  ownerId: string;
  isWellFormed: boolean;
  reaction: CombatUnitReaction;
  affiliation: CombatUnitAffiliation;
  type: CombatUnitType;
  class: CombatUnitClass;
  spec: CombatUnitSpec;
  info?: CombatantInfo;

  damageIn: CombatHpUpdateAction[];
  damageOut: (CombatHpUpdateAction | CombatAbsorbAction)[];
  healIn: CombatHpUpdateAction[];
  healOut: CombatHpUpdateAction[];

  /**
   * Absorb events for absorbs that prevented damage on the ICombatUnit
   */
  absorbsIn: CombatAbsorbAction[];
  /**
   * Absorb events for shields the ICombatUnit casted
   */
  absorbsOut: CombatAbsorbAction[];
  /**
   * Absorb events caused by attacks that ICombatUnit cast that hit a shield instead of hp
   */
  absorbsDamaged: CombatAbsorbAction[];

  /**
   * Support damage events that describe damage added to a spell ICombatUnit cast
   */
  supportDamageIn: CombatSupportAction[];
  /**
   * Support damage events caused by a supporting spell cast by ICombatUnit
   */
  supportDamageOut: CombatSupportAction[];
  /**
   * Support healing events that describe healing added to a spell ICombatUnit cast
   */
  supportHealIn: CombatSupportAction[];
  /**
   * Support healing events caused by a supporting spell cast by ICombatUnit
   */
  supportHealOut: CombatSupportAction[];

  actionIn: ILogLine[];
  actionOut: ILogLine[];
  auraEvents: CombatAction[];
  spellCastEvents: CombatAction[];
  deathRecords: ILogLine[];
  consciousDeathRecords: ILogLine[];
  advancedActions: CombatAdvancedAction[];
}

export class CombatUnit implements ICombatUnit {
  public reaction: CombatUnitReaction = CombatUnitReaction.Neutral;
  public affiliation: CombatUnitAffiliation = CombatUnitAffiliation.None;
  public type: CombatUnitType = CombatUnitType.None;
  public class: CombatUnitClass = CombatUnitClass.None;
  public spec: CombatUnitSpec = CombatUnitSpec.None;

  public info: CombatantInfo | undefined = undefined;
  public id = '';
  public ownerId = '';
  public name = '';
  public isWellFormed = false;
  public isActive = false;

  public damageIn: CombatHpUpdateAction[] = [];
  public damageOut: (CombatHpUpdateAction | CombatAbsorbAction)[] = [];
  public healIn: CombatHpUpdateAction[] = [];
  public healOut: CombatHpUpdateAction[] = [];
  public absorbsIn: CombatAbsorbAction[] = [];
  public absorbsOut: CombatAbsorbAction[] = [];
  public absorbsDamaged: CombatAbsorbAction[] = [];

  public supportDamageIn: CombatSupportAction[] = [];
  public supportDamageOut: CombatSupportAction[] = [];
  public supportHealIn: CombatSupportAction[] = [];
  public supportHealOut: CombatSupportAction[] = [];

  public actionIn: ILogLine[] = [];
  public actionOut: ILogLine[] = [];
  public auraEvents: CombatAction[] = [];
  public spellCastEvents: CombatAction[] = [];
  public deathRecords: ILogLine[] = [];
  public consciousDeathRecords: ILogLine[] = [];
  public advancedActions: CombatAdvancedAction[] = [];

  public startTime = 0;
  public endTime = 0;
  private reactionProofs: Map<CombatUnitReaction, number> = new Map<CombatUnitReaction, number>();
  private typeProofs: Map<CombatUnitType, number> = new Map<CombatUnitType, number>();
  private classProofs: Map<CombatUnitClass, number> = new Map<CombatUnitClass, number>();

  constructor(id: string, name: string) {
    this.id = id;
    this.name = name;
  }

  public proveClass(unitClass: CombatUnitClass) {
    if (!this.classProofs.has(unitClass)) {
      this.classProofs.set(unitClass, 0);
    }

    this.classProofs.set(unitClass, (this.classProofs.get(unitClass) || 0) + 1);
  }

  public proveSpec(spec: CombatUnitSpec) {
    this.spec = spec;
  }

  public proveReaction(reaction: CombatUnitReaction) {
    if (!this.reactionProofs.has(reaction)) {
      this.reactionProofs.set(reaction, 0);
    }

    this.reactionProofs.set(reaction, (this.reactionProofs.get(reaction) || 0) + 1);
  }

  public proveOwner(ownerId: string) {
    if (ownerId.length && ownerId !== '0000000000000000' && !this.ownerId.length) {
      this.ownerId = ownerId;
    }
  }

  public proveType(type: CombatUnitType) {
    if (!this.typeProofs.has(type)) {
      this.typeProofs.set(type, 0);
    }

    this.typeProofs.set(type, (this.typeProofs.get(type) || 0) + 1);
  }

  public endActivity() {
    if (this.auraEvents.length > 0) {
      if (this.auraEvents[0].srcUnitId === this.id) {
        this.affiliation = getUnitAffiliation(this.auraEvents[0].srcUnitFlags);
      }
    }

    if (this.spellCastEvents.length > 0) {
      if (this.spellCastEvents[0].srcUnitId === this.id) {
        this.affiliation = getUnitAffiliation(this.spellCastEvents[0].srcUnitFlags);
      }
    }

    if (
      this.damageIn.length +
        this.damageOut.length +
        this.healIn.length +
        this.healOut.length +
        this.actionIn.length +
        this.actionOut.length >
        6 &&
      this.endTime - this.startTime > 2000
    ) {
      this.isActive = true;
    }
  }

  public end() {
    if (this.typeProofs.size > 0) {
      const proofs: [CombatUnitType, number][] = [];
      this.typeProofs.forEach((value, key) => {
        proofs.push([key, value]);
      });
      const sorted = _.sortBy(proofs, (proof) => -proof[1]);
      this.type = sorted[0][0];
    }

    if (this.reactionProofs.size > 0) {
      const proofs: [CombatUnitReaction, number][] = [];
      this.reactionProofs.forEach((value, key) => {
        proofs.push([key, value]);
      });
      const sorted = _.sortBy(proofs, (proof) => -proof[1]);
      this.reaction = sorted[0][0];
    }

    if (this.classProofs.size > 0) {
      const proofs: [CombatUnitClass, number][] = [];
      this.classProofs.forEach((value, key) => {
        proofs.push([key, value]);
      });
      const sorted = _.sortBy(proofs, (proof) => -proof[1]);
      this.class = sorted[0][0];
    }

    if (
      this.class !== CombatUnitClass.None &&
      this.type !== CombatUnitType.None &&
      this.reaction !== CombatUnitReaction.Neutral &&
      this.isActive
    ) {
      this.isWellFormed = true;
    }
  }
}
