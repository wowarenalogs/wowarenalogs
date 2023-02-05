import { Column, Entity, ManyToOne, OneToMany, PrimaryGeneratedColumn } from 'typeorm';

import { CombatUnitSpec } from '../../../parser/dist/index';
import { CombatStatRecord } from './combat';
import { PlayerStatRecord } from './player';

@Entity()
export class TeamStatRecord {
  @PrimaryGeneratedColumn()
  rowId: number;

  @Column('varchar', { length: 32 })
  specs: string;

  @Column('tinyint')
  teamId: number;

  @Column('float')
  burstDps: number;

  @Column('float')
  effectiveDps: number;

  @Column('float')
  effectiveHps: number;

  @Column({
    type: 'enum',
    enum: CombatUnitSpec,
    default: CombatUnitSpec.None,
  })
  killTargetSpec: CombatUnitSpec;

  @ManyToOne(() => CombatStatRecord, (combat) => combat.teamRecords, {
    createForeignKeyConstraints: false,
  })
  combatRecord: CombatStatRecord;

  @OneToMany(() => PlayerStatRecord, (player) => player.teamRecord, {
    cascade: true,
  })
  playerRecords: PlayerStatRecord[];
}
