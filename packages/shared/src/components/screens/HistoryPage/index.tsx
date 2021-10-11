import { getApolloContext } from '@apollo/client';
import { useTranslation } from 'next-i18next';
import { useContext, useState } from 'react';

import { GetMyMatchesDocument, CombatDataStub } from '../../../graphql/__generated__/graphql';
import { useAuth } from '../../../hooks/AuthContext';
import { Box } from '../../common/Box';
import { InfiniteCombatDataStubList } from '../../common/InfiniteCombatDataStubList';
import { LoadingScreen } from '../../common/LoadingScreen';
import { LoginModal } from '../../common/LoginModal';

export const HistoryPage = () => {
  const { t } = useTranslation();
  const context = useContext(getApolloContext());
  const auth = useAuth();
  const [loading, setLoading] = useState(false);
  const [allCombats, setAllCombats] = useState<CombatDataStub[]>([]);
  const [hasNextPage, setHasNextPage] = useState(true);
  const [queryLimitReached, setQueryLimitReached] = useState(false);
  const [showLoginModal, setShowLoginModal] = useState(true);

  if (auth.isLoadingAuthData) {
    return <LoadingScreen />;
  }

  if (!auth.isAuthenticated) {
    return (
      <LoginModal
        show={showLoginModal}
        onClose={() => {
          setShowLoginModal(false);
        }}
      />
    );
  }

  return (
    <Box flex={1} display="flex" flexDirection="column">
      <InfiniteCombatDataStubList
        header={t('history-page-title')}
        combats={allCombats}
        combatUrlFactory={(id) => {
          return `/matches/${id}`;
        }}
        applyUtcFix={true}
        loading={loading}
        queryLimitReached={queryLimitReached}
        shareableUserId={auth.isAuthenticated ? (auth.userId as string) : undefined}
        hasNextPage={hasNextPage}
        loadNextPage={(startIndex) => {
          if (!context.client) {
            return Promise.resolve();
          }
          setLoading(true);
          return context.client
            .query({
              query: GetMyMatchesDocument,
              variables: {
                anonymousUserId: auth.isAuthenticated ? null : (auth.userId as string),
                offset: startIndex,
              },
            })
            .then((result) => {
              setLoading(false);
              if (result.data.myMatches && result.data.myMatches.queryLimitReached) {
                setQueryLimitReached(true);
              }
              setAllCombats((prev) => {
                return prev.concat(result.data.myMatches.combats);
              });
              if (!result.data.myMatches || !result.data.myMatches.combats || !result.data.myMatches.combats.length) {
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
