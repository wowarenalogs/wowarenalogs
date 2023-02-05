import { Column, Entity, OneToMany, PrimaryColumn } from 'typeorm';

import { CombatResult } from '../../../parser/dist/index';
import { TeamStatRecord } from './team';

@Entity()
export class CombatStatRecord {
  @PrimaryColumn()
  combatId: string;

  @Column('char', { length: 10 })
  date: string;

  @Column('varchar', { length: 32 })
  bracket: string;

  @Column('varchar', { length: 16 })
  zoneId: string;

  @Column('float')
  durationInSeconds: number;

  @Column('float')
  effectiveDurationInSeconds: number;

  @Column('float')
  averageMMR: number;

  @Column({
    type: 'enum',
    enum: CombatResult,
    default: CombatResult.Unknown,
  })
  logOwnerResult: CombatResult;

  @Column('varchar', { length: 64 })
  logOwnerUnitId: string;

  @Column('tinyint')
  logOwnerTeamId: number;

  @Column('tinyint')
  winningTeamId: number;

  @OneToMany(() => TeamStatRecord, (team) => team.combatRecord, {
    cascade: true,
  })
  teamRecords: TeamStatRecord[];
}
