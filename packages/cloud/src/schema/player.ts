import { Column, Entity, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';

import { CombatUnitSpec } from '../../../parser/dist/index';
import { TeamStatRecord } from './team';

@Entity()
export class PlayerStatRecord {
  @PrimaryGeneratedColumn()
  rowId: number;

  @Column('varchar', { length: 64 })
  unitId: string;

  @Column('varchar', { length: 64 })
  name: string;

  @Column('smallint')
  rating: number;

  @Column({
    type: 'enum',
    enum: CombatUnitSpec,
    default: CombatUnitSpec.None,
  })
  spec: CombatUnitSpec;

  @Column('float')
  burstDps: number;

  @Column('float')
  effectiveDps: number;

  @Column('float')
  effectiveHps: number;

  @Column('bool')
  isKillTarget: boolean;

  @ManyToOne(() => TeamStatRecord, (team) => team.playerRecords, {
    createForeignKeyConstraints: false,
  })
  teamRecord: TeamStatRecord;
}
