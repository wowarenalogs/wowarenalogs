import { AnalysisReportList } from '@wowarenalogs/shared';
import { GetServerSideProps } from 'next';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';

export default AnalysisReportList;

export const getServerSideProps: GetServerSideProps = async (context) => {
  return {
    props: {
      ...(await serverSideTranslations(context.locale || 'en', ['common'])),
      reports: [
        {
          id: 1,
          Title: 'What Spell Killed Most People?',
          Body: 'Sharing this quick fun fact we found during a larger analysis we are doing. For reference, here we picked matches that are\n- at least 1400+\n- happened in 9.0.5\n- only look at the spell that caused the first death\n\n![What Spell Killed Most People](https://images.wowarenalogs.com/reports/what_spell_killed_most_people_top_30_24622b0fa3/what_spell_killed_most_people_top_30_24622b0fa3.png)\n',
          published_at: '2021-04-05T00:10:47.000Z',
          created_at: '2021-04-05T00:10:38.000Z',
          updated_at: '2021-04-19T04:55:05.000Z',
          Slug: 'what-spell-killed-most-people',
          Summary: "Sharing some fun facts about what spells killed the most people. What's your guess?",
        },
        {
          id: 2,
          Title: 'Single Target Burst Window Damage By Spec',
          Body: 'Hi everyone! Since the launch of WoW Arena Logs, we\'ve been humbled by the positive feedback from the community and the increasing number of people making use of the tool. Now that we have seen over a hundred thousand unique players in uploaded combats, we thought it would be useful to report some interesting aggregated analysis.\n\nIn this report, we look at how much damage each spec can deal within 1.5s windows to understand the kind of bursts that are tricky to counter. We excluded AOE damage and only look at peak damage towards a single target. On top of that, we cleaned up burst damage numbers that are lower than 5000 which is somewhat arbitrary but the main purpose was to exclude cases that did not represent a meaningful burst.\n\n![1500ms_single_target_burst_window_damage.png](https://images.wowarenalogs.com/reports/1500ms_single_target_burst_window_damage_710cd2b253/1500ms_single_target_burst_window_damage_710cd2b253.png)\n\n### Chart Explanation\n- We only looked at combats that happened in 9.0.5 and have excluded all arena matches below the 1400 bracket.\n- We look at each arena match, and calculate the peak damage each player dealt within 1.5-sec windows.\n- The colored boxes represent the peak window burst damage from the spec, ranging from the 25th to the 75th percentile, which means there are 25% of players dealt less burst damage than the lower bound of the box, and there are 25% that dealt more than the upper bound.\n- The black line in the middle of each colored box represent the median value. You can consider it the "average" case. \n- The white lines extending further outside of the colored boxes represent the minimum and maximum burst damage from the spec, excluding some extreme outliers.\n\n### Takeaways\n- Retribution Paladin and Balance Druid are the top two bursty specs. In upper bound cases they can deal almost 40k damages within a 1.5 second window. This in many cases means a 100-0 within a GCD which is very scary and hard to counter.\n- Affliction Warlocks and Frost DKs are generally understood as being good at spread pressure but we can see they are weaker at bursting a single target.\n- Resto Shaman and Misweaver Monk can both provide very meaningful bursts to assist the team at securing a kill.\n- Guardian Druids are a bit unique in that they have a low median but high upper bound, which means most of the time they do not have high burst, but occasionally they could deal over 34k damage within a GCD which is likely through convoke.\n- A few specs who have high consistent damage, such as Arms Warriors and BeastMastery Hunters etc are all pretty low in this list. However, Windwalker Monks stand out as a spec that has both high consistent pressure and high burst damage.\n- Looking at the average cases though, most specs deal 10k to 20k burst damage within 1.5 second which means one-shots are definitely not the norm. Securing a kill would require a good setup or follow ups.',
          published_at: '2021-04-19T05:17:36.000Z',
          created_at: '2021-04-19T05:17:23.000Z',
          updated_at: '2021-04-19T05:17:36.000Z',
          Slug: 'single-target-burst-window-damage-by-spec',
          Summary:
            'In this report, we look at how much damage each spec can deal within 1.5s windows to understand how "bursty" each spec is.',
        },
      ],
    },
  };
};
