import { CombatUnitClass, CombatUnitReaction, CombatUnitType } from '@wowarenalogs/parser';
import { CombatReportFromStorage, ICombatDataStub } from '@wowarenalogs/shared';
import { matchById } from '@wowarenalogs/shared/src/graphql-server/resolvers/matches';
import { GetServerSidePropsContext } from 'next';
import { useRouter } from 'next/router';
import { NextSeo } from 'next-seo';

const generateDescription = (combat: ICombatDataStub) => {
  const friends = Object.values(combat.units).filter(
    (u) => u.type === CombatUnitType.Player && u.reaction === CombatUnitReaction.Friendly,
  );
  const enemies = Object.values(combat.units).filter(
    (u) => u.type === CombatUnitType.Player && u.reaction === CombatUnitReaction.Hostile,
  );

  const friendTeamSpecs = friends
    .map((u) => CombatUnitClass[u.class])
    .sort()
    .join(', ');
  const enemyTeamSpecs = enemies
    .map((u) => CombatUnitClass[u.class])
    .sort()
    .join(', ');

  return `A ${combat.startInfo.bracket} arena match between ${friendTeamSpecs} and ${enemyTeamSpecs}`;
};

const Page = (props: { combat?: ICombatDataStub }) => {
  const router = useRouter();

  const { id, viewerIsOwner } = router.query;
  if (!id || typeof id !== 'string' || !props.combat) {
    return null;
  }

  const desc = generateDescription(props.combat);

  return (
    <>
      <NextSeo
        title="Combat Report"
        description={desc}
        openGraph={{
          title: 'Combat Report | WoW Arena Logs',
          description: desc,
        }}
      />
      <CombatReportFromStorage id={id} viewerIsOwner={viewerIsOwner === 'true'} />
    </>
  );
};

export default Page;

export async function getServerSideProps(context: GetServerSidePropsContext) {
  const id: string = context.query.id as string;
  if (!id) {
    return {
      props: {
        combat: null,
      },
    };
  }

  const combat = await matchById(undefined, { matchId: id });
  return {
    props: {
      combat,
    },
  };
}
