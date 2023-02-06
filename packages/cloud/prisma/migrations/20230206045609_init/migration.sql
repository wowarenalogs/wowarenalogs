-- CreateTable
CREATE TABLE "CombatStatRecord" (
    "combatId" STRING(64) NOT NULL,
    "date" CHAR(10) NOT NULL,
    "bracket" STRING(32) NOT NULL,
    "zoneId" STRING(16) NOT NULL,
    "durationInSeconds" FLOAT8 NOT NULL,
    "effectiveDurationInSeconds" FLOAT8 NOT NULL,
    "averageMMR" FLOAT8 NOT NULL,
    "logOwnerResult" INT2 NOT NULL,
    "logOwnerUnitId" STRING(64) NOT NULL,
    "logOwnerTeamId" INT2 NOT NULL,
    "winningTeamId" INT2 NOT NULL,

    CONSTRAINT "CombatStatRecord_pkey" PRIMARY KEY ("combatId")
);

-- CreateTable
CREATE TABLE "TeamStatRecord" (
    "rowId" INT8 NOT NULL DEFAULT unique_rowid(),
    "specs" STRING(32) NOT NULL,
    "teamId" INT2 NOT NULL,
    "burstDps" FLOAT8 NOT NULL,
    "effectiveDps" FLOAT8 NOT NULL,
    "effectiveHps" FLOAT8 NOT NULL,
    "killTargetSpec" STRING(8) NOT NULL,
    "combatId" STRING(64) NOT NULL,

    CONSTRAINT "TeamStatRecord_pkey" PRIMARY KEY ("rowId")
);

-- CreateTable
CREATE TABLE "PlayerStatRecord" (
    "rowId" INT8 NOT NULL DEFAULT unique_rowid(),
    "unitId" STRING(64) NOT NULL,
    "name" STRING(64) NOT NULL,
    "rating" INT2 NOT NULL,
    "spec" STRING(8) NOT NULL,
    "burstDps" FLOAT8 NOT NULL,
    "effectiveDps" FLOAT8 NOT NULL,
    "effectiveHps" FLOAT8 NOT NULL,
    "isKillTarget" BOOL NOT NULL,
    "teamId" INT8 NOT NULL,

    CONSTRAINT "PlayerStatRecord_pkey" PRIMARY KEY ("rowId")
);

-- AddForeignKey
ALTER TABLE "TeamStatRecord" ADD CONSTRAINT "TeamStatRecord_combatId_fkey" FOREIGN KEY ("combatId") REFERENCES "CombatStatRecord"("combatId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerStatRecord" ADD CONSTRAINT "PlayerStatRecord_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "TeamStatRecord"("rowId") ON DELETE RESTRICT ON UPDATE CASCADE;
