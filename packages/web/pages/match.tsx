import { CombatReportFromStorage } from '@wowarenalogs/shared';
import { useRouter } from 'next/router';
import { NextSeo } from 'next-seo';

// NOTE:
// SEO titles/description stuff is currently on ice to reduce firestore load

// const generateDescription = (combat: ICombatDataStub) => {
//   const friends = Object.values(combat.units).filter(
//     (u) => u.type === CombatUnitType.Player && u.reaction === CombatUnitReaction.Friendly,
//   );
//   const enemies = Object.values(combat.units).filter(
//     (u) => u.type === CombatUnitType.Player && u.reaction === CombatUnitReaction.Hostile,
//   );

//   const friendTeamSpecs = friends
//     .map((u) => CombatUnitClass[u.class])
//     .sort()
//     .join(', ');
//   const enemyTeamSpecs = enemies
//     .map((u) => CombatUnitClass[u.class])
//     .sort()
//     .join(', ');

//   return `A ${combat.startInfo.bracket} arena match between ${friendTeamSpecs} and ${enemyTeamSpecs}`;
// };

const Page = () => {
  const router = useRouter();
  const { id, viewerIsOwner, roundId } = router.query;
  if (!id || typeof id !== 'string') {
    return null;
  }

  //const desc = generateDescription(props.combat);  SEE NOTE AT TOP

  return (
    <>
      <NextSeo
        title="Combat Report"
        // description={'none'} SEE NOTE AT TOP
        openGraph={{
          title: 'Combat Report | WoW Arena Logs',
          // description: 'none', SEE NOTE AT TOP
        }}
      />
      <CombatReportFromStorage
        id={id}
        roundId={roundId ? roundId.toString() : undefined}
        viewerIsOwner={viewerIsOwner === 'true'}
      />
    </>
  );
};

export default Page;

// SEE NOTE AT TOP
// export async function getServerSideProps(context: GetServerSidePropsContext) {
//   const id: string = context.query.id as string;
//   if (!id) {
//     return {
//       props: {
//         combat: null,
//       },
//     };
//   }

//   const combat = await matchById(undefined, { matchId: id });
//   return {
//     props: {
//       combat,
//     },
//   };
// }
