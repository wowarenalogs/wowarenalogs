import { CloseOutlined, QuestionOutlined } from '@ant-design/icons';
import { getApolloContext } from '@apollo/client';
import { Space, Radio, Menu, Dropdown, Button, Checkbox, Card } from 'antd';
import Text from 'antd/lib/typography/Text';
import Title from 'antd/lib/typography/Title';
import _ from 'lodash';
import { useTranslation } from 'next-i18next';
import { NextSeo } from 'next-seo';
import { useRouter } from 'next/router';
import { useContext, useEffect } from 'react';
import { useState } from 'react';
import { CombatUnitSpec } from 'wow-combat-log-parser';

import styles from './index.module.css';

import { CombatDataStub, GetPublicMatchesDocument } from '../../../graphql/__generated__/graphql';
import { Utils } from '../../../utils';
import { Box } from '../../common/Box';
import { InfiniteCombatDataStubList } from '../../common/InfiniteCombatDataStubList';
import { LoadingScreen } from '../../common/LoadingScreen';

const RATING_BREAKPOINTS = [0, 1400, 1800, 2100];
const CLASS_NAMES = new Set();
const SPECS = Object.entries(CombatUnitSpec)
  .filter((c) => c[0].search('_') > -1)
  .map((c) => {
    const parts = c[0].split('_');
    CLASS_NAMES.add(parts[0]);
    return [parts[0], parts[1], c[1]];
  });
const PLAYABLE_CLASSES = _.entries(CLASS_NAMES).map((c) => c[0]);

function SpecMenu(props: { onClick: (specId: CombatUnitSpec) => void }) {
  return (
    <Menu>
      {PLAYABLE_CLASSES.map((c) => (
        <Menu.SubMenu key={c} title={c}>
          {SPECS.filter((s) => s[0] === c).map((s) => (
            <Menu.Item onClick={() => props.onClick(s[2] as CombatUnitSpec)} key={s[1]}>
              {s[1]}
            </Menu.Item>
          ))}
        </Menu.SubMenu>
      ))}
    </Menu>
  );
}

interface SpecIconBoxProps {
  spec: CombatUnitSpec;
  removeCallback: (s: CombatUnitSpec) => void;
  addCallback: (s: CombatUnitSpec) => void;
}

function SpecIconBox({ spec, removeCallback, addCallback }: SpecIconBoxProps) {
  if (spec) {
    return (
      <Box onClick={() => removeCallback(spec)} className={styles['spec-icon-active']}>
        <Box className={styles['spec-icon-active-hover']}>
          <CloseOutlined />
        </Box>
        <Box
          style={{
            backgroundImage: `url(${Utils.getSpecIcon(spec)})`,
            backgroundSize: 'cover',
            width: '100%',
            height: '100%',
          }}
        />
      </Box>
    );
  }
  return (
    <Dropdown overlay={<SpecMenu onClick={addCallback} />} trigger={['click', 'hover']}>
      <Box className={styles['spec-icon-add']}>
        <QuestionOutlined />
      </Box>
    </Dropdown>
  );
}

function computeCompQueryString(team1specs: CombatUnitSpec[], team2specs: CombatUnitSpec[]) {
  if (team2specs.length > 0) {
    return team1specs.sort().join('_') + 'x' + team2specs.sort().join('_');
  } else {
    return team1specs.sort().join('_');
  }
}

interface IPublicMatchesFilters {
  minRating: number;
  winsOnly: boolean;
  bracket: '2v2' | '3v3';
  team1SpecIds: CombatUnitSpec[];
  team2SpecIds: CombatUnitSpec[];
}

const parseEncodedFilters = (encodedFilters: string | undefined): IPublicMatchesFilters => {
  if (!encodedFilters) {
    return {
      minRating: 0,
      winsOnly: false,
      bracket: '3v3',
      team1SpecIds: [],
      team2SpecIds: [],
    };
  }
  const filters: IPublicMatchesFilters = JSON.parse(atob(encodedFilters));
  return filters;
};

let nextQueryId = 0;

export const PublicMatchesPage = () => {
  const { t } = useTranslation();
  const context = useContext(getApolloContext());
  const router = useRouter();
  const [filters, setFiltersImpl] = useState<IPublicMatchesFilters>({
    minRating: 0,
    winsOnly: false,
    bracket: '3v3',
    team1SpecIds: [],
    team2SpecIds: [],
  });
  const [initializing, setInitializing] = useState(true);
  const [loading, setLoading] = useState(false);
  const [allCombats, setAllCombats] = useState<CombatDataStub[]>([]);
  const [hasNextPage, setHasNextPage] = useState(true);
  const [queryLimitReached, setQueryLimitReached] = useState(false);
  const [queryId, setQueryId] = useState<number>(nextQueryId);

  useEffect(() => {
    if (router.isReady) {
      const params = router.query;
      const filtersParam = params.filters && params.filters.length ? (params.filters[0] as string) : undefined;
      setFiltersImpl(parseEncodedFilters(filtersParam));
      setInitializing(false);
    }
  }, [router.isReady, router.query]);

  if (initializing) {
    return <LoadingScreen />;
  }

  const setFilters = (filters: IPublicMatchesFilters) => {
    setFiltersImpl(filters);
    const encoded = btoa(JSON.stringify(filters));
    router.push(`/community-matches/shadowlands/${encoded}`, undefined, { shallow: true });

    setLoading(false);
    setAllCombats([]);
    setHasNextPage(true);
    setQueryLimitReached(false);
    setQueryId(++nextQueryId);
  };

  const compQuery = computeCompQueryString(filters.team1SpecIds, filters.team2SpecIds);

  function addToOne(s: CombatUnitSpec): void {
    setFilters({
      ...filters,
      team1SpecIds: [...filters.team1SpecIds, s],
    });
  }
  function addToTwo(s: CombatUnitSpec): void {
    setFilters({
      ...filters,
      team2SpecIds: [...filters.team2SpecIds, s],
    });
  }
  function remFromOne(s: CombatUnitSpec): void {
    setFilters({
      ...filters,
      team1SpecIds: filters.team1SpecIds.filter((t) => t !== s),
    });
  }
  function remFromTwo(s: CombatUnitSpec): void {
    setFilters({
      ...filters,
      team2SpecIds: filters.team2SpecIds.filter((t) => t !== s),
    });
  }
  function clearAllFilters() {
    setFilters({
      minRating: 0,
      bracket: '3v3',
      winsOnly: false,
      team1SpecIds: [],
      team2SpecIds: [],
    });
  }

  return (
    <Box flex={1} display="flex" flexDirection="column">
      <NextSeo
        title={t('community-matches-page-title')}
        description={t('community-matches-page-description')}
        openGraph={{
          title: t('community-matches-page-title'),
          description: t('community-matches-page-description'),
        }}
      />
      <Box>
        <Title level={2}>{t('community-matches-page-title')}</Title>
      </Box>
      <Box mb={4}>
        <Card
          title={t('community-matches-filters')}
          extra={
            <Button key="clear" onClick={clearAllFilters}>
              {t('clear')}
            </Button>
          }
        >
          <Box display="flex" flexDirection="row">
            <Box mr={2}>
              <Title level={5}>{t('community-matches-filters-ladder')}</Title>
              <Radio.Group
                value={filters.bracket}
                onChange={(v) => {
                  setFilters({
                    ...filters,
                    bracket: v.target.value,
                  });
                }}
              >
                <Radio key={`2v2`} value={'2v2'}>
                  2v2
                </Radio>
                <Radio key={`3v3`} value={'3v3'}>
                  3v3
                </Radio>
              </Radio.Group>
            </Box>
            <Box>
              <Title level={5}>{t('community-matches-filters-rating')}</Title>
              <Radio.Group
                value={filters.minRating}
                onChange={(v) => {
                  setFilters({
                    ...filters,
                    minRating: v.target.value,
                  });
                }}
              >
                {RATING_BREAKPOINTS.map((r) => (
                  <Radio key={`${r}_radio`} value={r}>
                    {r === 0 ? t('any') : `${r}+`}
                  </Radio>
                ))}
              </Radio.Group>
            </Box>
          </Box>
          <Box mt={2} display="flex" flexDirection="column" alignItems="flex-start">
            <Title level={5}>{t('community-matches-filters-composition')}</Title>
            <Box display="flex" flexDirection="row" alignItems="center">
              <Space>
                {(filters.bracket === '2v2' ? _.range(0, 2) : _.range(0, 3)).map((s) => (
                  <SpecIconBox
                    key={s}
                    spec={filters.team1SpecIds[s]}
                    addCallback={addToOne}
                    removeCallback={remFromOne}
                  />
                ))}
              </Space>
              <Box mx={2}>
                <Text type="secondary">VS</Text>
              </Box>
              <Space>
                {(filters.bracket === '2v2' ? _.range(0, 2) : _.range(0, 3)).map((s) => (
                  <SpecIconBox
                    key={s}
                    spec={filters.team2SpecIds[s]}
                    addCallback={addToTwo}
                    removeCallback={remFromTwo}
                  />
                ))}
              </Space>
            </Box>
            <Box
              display="flex"
              flexDirection="row"
              alignItems="center"
              mt={2}
              title={t('community-matches-filters-team-1-wins-explanation')}
            >
              <Checkbox
                checked={filters.winsOnly}
                onChange={(v) =>
                  setFilters({
                    ...filters,
                    winsOnly: v.target.checked,
                  })
                }
              >
                {t('community-matches-filters-team-1-wins')}
              </Checkbox>
            </Box>
          </Box>
        </Card>
      </Box>
      <InfiniteCombatDataStubList
        key={queryId}
        showSummary={false}
        combats={allCombats}
        applyUtcFix={true}
        viewerIsOwner={false}
        loading={loading}
        combatUrlFactory={(id) => {
          return `/matches/community/${id}/${btoa(JSON.stringify(filters))}`;
        }}
        queryLimitReached={queryLimitReached}
        hasNextPage={hasNextPage}
        loadNextPage={(startIndex) => {
          if (!context.client) {
            return Promise.resolve();
          }
          setLoading(true);
          return context.client
            .query({
              query: GetPublicMatchesDocument,
              variables: {
                offset: startIndex,
                wowVersion: 'retail',
                bracket: filters.bracket,
                minRating: filters.minRating,
                compQueryString: compQuery,
                lhsShouldBeWinner: filters.winsOnly ? true : undefined,
              },
            })
            .then((result) => {
              setLoading(false);
              if (result.data.latestMatches && result.data.latestMatches.queryLimitReached) {
                setQueryLimitReached(true);
              }
              if (
                !result.data.latestMatches ||
                !result.data.latestMatches.combats ||
                !result.data.latestMatches.combats.length
              ) {
                setHasNextPage(false);
              }
              setAllCombats((prev) => {
                return prev.concat(result.data.latestMatches.combats);
              });
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
