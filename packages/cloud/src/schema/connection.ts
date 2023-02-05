import 'reflect-metadata';

import dotenv from 'dotenv';
import { DataSource } from 'typeorm';

import { CombatStatRecord } from './combat';
import { PlayerStatRecord } from './player';
import { TeamStatRecord } from './team';

if (process.env.NODE_ENV === 'development') {
  dotenv.config();
}

export const SQLDB = new DataSource({
  type: 'mysql',
  url: process.env.ENV_SQL_URL,
  ssl: {
    rejectUnauthorized: process.env.NODE_ENV === 'development' ? false : true,
  },
  synchronize: false,
  logging: false,
  entities: [CombatStatRecord, TeamStatRecord, PlayerStatRecord],
  subscribers: [],
  migrations: [],
});
