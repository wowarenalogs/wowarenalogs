import { CombatantInfo, IArenaMatch, ICombatUnit, IShuffleRound } from '@wowarenalogs/parser';

export enum UserSubscriptionTier {
  Common = 'Common',
  Rare = 'Rare',
}

export interface User {
  id: string;
  battlenetId: string | null;
  battletag: string | null;
  referrer: string | null;
  subscriptionTier: UserSubscriptionTier;
  tags: string[];
}

export interface ApolloContext {
  user: User | null;
}

/*
  Stub classes should be carefully edited to reflect their
  non-stub versions cleanly. If fields are removed in the definition
  of a stub from the base, leave them as commented out here.
*/
/**
 * Stub of CombatantInfo for cloud storage
 *
 * Missing fields as of 11/10/2022:
 * * strength: number;
 * * agility: number;
 * * stamina: number;
 * * intelligence: number;
 * * dodge: number;
 * * parry: number;
 * * block: number;
 * * critMelee: number;
 * * critRanged: number;
 * * critSpell: number;
 * * speed: number;
 * * lifesteal: number;
 * * hasteMelee: number;
 * * hasteRanged: number;
 * * hasteSpell: number;
 * * avoidance: number;
 * * mastery: number;
 * * versatilityDamgeDone: number;
 * * versatilityHealingDone: number;
 * * versatilityDamageTaken: number;
 * * armor: number;
 * * equipment: EquippedItem[];
 * * interestingAurasJSON: string;
 * * item28: number;
 * * item29: number;
 */
export interface ICombatantInfoStub
  extends Pick<CombatantInfo, 'teamId' | 'specId' | 'talents' | 'pvpTalents' | 'personalRating' | 'highestPvpTier'> {}

/**
 * Stub of ICombatUnit for cloud storage
 *
 * Missing fields as of 11/10/2022:
 * * isWellFormed: boolean;
 * * damageIn: CombatHpUpdateAction[];
 * * damageOut: CombatHpUpdateAction[];
 * * healIn: CombatHpUpdateAction[];
 * * healOut: CombatHpUpdateAction[];
 * * absorbsIn: CombatAbsorbAction[];
 * * absorbsOut: CombatAbsorbAction[];
 * * absorbsDamaged: CombatAbsorbAction[];
 * * actionIn: ILogLine[];
 * * actionOut: ILogLine[];
 * * auraEvents: CombatAction[];
 * * spellCastEvents: CombatAction[];
 * * deathRecords: ILogLine[];
 * * consciousDeathRecords: ILogLine[];
 * * advancedActions: CombatAdvancedAction[];
 */
export interface ICombatUnitStub
  extends Pick<ICombatUnit, 'id' | 'name' | 'reaction' | 'affiliation' | 'type' | 'class' | 'spec'> {
  info?: ICombatantInfoStub;
}

export interface IArenaMatchStub extends Omit<IArenaMatch, 'units' | 'events' | 'rawLines'> {}
export interface IShuffleRoundStub extends Omit<IShuffleRound, 'units' | 'events' | 'rawLines'> {}

interface IUnitsStub {
  /**
   * A copy of the units array from a parsed log output with
   * some fields removed to save space when stored in the cloud
   *
   * Combat event mappings are notable all removed
   * As is unit equipped items
   */
  units: ICombatUnitStub[];
}

/**
 * These items are useful for the frontend but ultimately only present as part of an uploaded log
 */
interface IDTOPublicFeatures {
  /**
   * Battle.net ID of the log uploader
   */
  ownerId: string;
  /**
   * Cloud storage URL of the raw log file
   */
  logObjectUrl: string;
  /**
   * TODO: what is this field for again?
   * It was something to do with how we were correcting for UTC time
   * differentials between the log and rtc of the user's machine
   */
  utcCorrected: boolean;
}

export type ICombatDataStub = (IArenaMatchStub | IShuffleRoundStub) & IUnitsStub & IDTOPublicFeatures;

export interface CombatQueryResult {
  combats: ICombatDataStub[];
  queryLimitReached: boolean;
}
