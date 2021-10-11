import { getApolloContext } from '@apollo/client';
import { useTranslation } from 'next-i18next';
import { useRouter } from 'next/router';
import { useContext, useState } from 'react';

import { GetUserMatchesDocument, CombatDataStub } from '../../../graphql/__generated__/graphql';
import { useAuth } from '../../../hooks/AuthContext';
import { Box } from '../../common/Box';
import { InfiniteCombatDataStubList } from '../../common/InfiniteCombatDataStubList';
import { LoadingScreen } from '../../common/LoadingScreen';

export const UserMatchesPage = () => {
  const { t } = useTranslation();
  const { userId } = useRouter().query;
  const context = useContext(getApolloContext());
  const auth = useAuth();
  const [loading, setLoading] = useState(false);
  const [allCombats, setAllCombats] = useState<CombatDataStub[]>([]);
  const [hasNextPage, setHasNextPage] = useState(true);
  const [queryLimitReached, setQueryLimitReached] = useState(false);

  if (auth.isLoadingAuthData) {
    return <LoadingScreen />;
  }

  return (
    <Box flex={1} display="flex" flexDirection="column">
      <InfiniteCombatDataStubList
        header={t('user-matches-page-title')}
        combats={allCombats}
        combatUrlFactory={(id) => {
          return `/matches/${id}`;
        }}
        applyUtcFix={true}
        loading={loading}
        queryLimitReached={queryLimitReached}
        hasNextPage={hasNextPage}
        loadNextPage={(startIndex) => {
          if (!context.client) {
            return Promise.resolve();
          }
          setLoading(true);
          return context.client
            .query({
              query: GetUserMatchesDocument,
              variables: {
                userId,
                offset: startIndex,
              },
            })
            .then((result) => {
              setLoading(false);
              if (result.data.userMatches && result.data.userMatches.queryLimitReached) {
                setQueryLimitReached(true);
              }
              setAllCombats((prev) => {
                return prev.concat(result.data.userMatches.combats);
              });
              if (
                !result.data.userMatches ||
                !result.data.userMatches.combats ||
                !result.data.userMatches.combats.length
              ) {
                setHasNextPage(false);
              }
            })
            .catch(() => {
              setLoading(false);
              setHasNextPage(false);
            });
        }}
      />
    </Box>
  );
};
