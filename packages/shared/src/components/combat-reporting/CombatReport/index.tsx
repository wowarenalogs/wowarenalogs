import { CopyOutlined, LeftOutlined, ShareAltOutlined } from '@ant-design/icons';
import { getApolloContext } from '@apollo/client';
import { Button, Input, Modal, Tabs } from 'antd';
import Text from 'antd/lib/typography/Text';
import Title from 'antd/lib/typography/Title';
import { useTranslation } from 'next-i18next';
import { NextSeo } from 'next-seo';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/router';
import { useContext, useMemo, useState } from 'react';
import { CombatUnitClass, CombatUnitReaction, CombatUnitType, ICombatData } from 'wow-combat-log-parser';

import styles from './index.module.css';

import { useGetProfileQuery } from '../../../graphql/__generated__/graphql';
import { logAnalyticsEvent } from '../../../utils/analytics';
import { canUseFeature } from '../../../utils/features';
import { zoneMetadata } from '../../../utils/zoneMetadata';
import { Box } from '../../common/Box';
import { TimestampDisplay } from '../../common/TimestampDisplay';
import { CombatLogView } from './CombatLogView';
import { ReplayUnavailable } from './CombatReplay/ReplayUnavailable';
import { CombatReportContextProvider } from './CombatReportContext';

const CombatCurves = dynamic(
  () => {
    const promise = import('./CombatCurves').then((mod) => mod.CombatCurves);
    return promise;
  },
  { ssr: false },
);

const CombatSummary = dynamic(
  () => {
    const promise = import('./CombatSummary').then((mod) => mod.CombatSummary);
    return promise;
  },
  { ssr: false },
);

const CombatPlayers = dynamic(
  () => {
    const promise = import('./CombatPlayers').then((mod) => mod.CombatPlayers);
    return promise;
  },
  { ssr: false },
);

const DeathReports = dynamic(
  () => {
    const promise = import('./DeathReports').then((mod) => mod.DeathReports);
    return promise;
  },
  { ssr: false },
);

const CombatReplay = dynamic(
  () => {
    const promise = import('./CombatReplay').then((mod) => mod.CombatReplay);
    return promise;
  },
  { ssr: false },
);

interface IProps {
  id: string;
  combat: ICombatData;
  anon?: boolean;
  search?: string;
}

const generateDescription = (combat: ICombatData) => {
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

export function CombatReport({ id, combat, anon, search }: IProps) {
  const { t } = useTranslation();
  const reportUrl = useMemo(() => {
    const url = anon ? `https://wowarenalogs.com/matches/community/${id}` : `https://wowarenalogs.com/matches/${id}`;
    return url;
  }, [anon, id]);
  const [showShareModal, setShowShareModal] = useState(false);
  const [urlCopied, setUrlCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<string>('summary');
  const [activePlayerId, setActivePlayerId] = useState<string | null>(null);
  const router = useRouter();
  const context = useContext(getApolloContext());
  const { data } = useGetProfileQuery({
    client: context.client,
  });
  const zoneInfo = zoneMetadata[combat.startInfo?.zoneId];
  const replayContainerStyles = activeTab === 'replay' ? { overflow: 'hidden' } : {};

  return (
    <CombatReportContextProvider
      combat={combat}
      isAnonymized={anon || false}
      navigateToPlayerView={(unitId: string) => {
        setActiveTab('players');
        setActivePlayerId(unitId);
      }}
    >
      <Box display="flex" flexDirection="column" style={replayContainerStyles}>
        <NextSeo
          title={t('combat-report-title')}
          description={generateDescription(combat)}
          openGraph={{
            title: t('combat-report-title'),
            description: generateDescription(combat),
          }}
        />
        <Box display="flex" flexDirection="row" alignItems="center">
          <Title level={2}>
            <Box display="flex" flexDirection="row" alignItems="center">
              {search && (
                <Button
                  type="text"
                  size="large"
                  onClick={() => {
                    router.push(`/community-matches/shadowlands/${search}`);
                  }}
                >
                  <LeftOutlined />
                </Button>
              )}
              <TimestampDisplay timestamp={combat.startTime} />
              <Text style={{ marginLeft: 16 }} type={'secondary'}>
                {zoneInfo?.name}
              </Text>
            </Box>
          </Title>
          <Box flex={1} />
          <Box pb={1}>
            <Button
              type="link"
              icon={<ShareAltOutlined />}
              onClick={() => {
                setShowShareModal(true);
              }}
            >
              {t('share')}
            </Button>
            <Modal
              visible={showShareModal}
              title={t('combat-report-share-report')}
              onCancel={() => {
                setShowShareModal(false);
              }}
              footer={null}
            >
              <Input
                readOnly
                addonAfter={
                  <Button
                    type={urlCopied ? 'text' : 'link'}
                    icon={<CopyOutlined />}
                    size="small"
                    onClick={() => {
                      navigator.clipboard.writeText(reportUrl).then(() => {
                        setUrlCopied(true);
                        setTimeout(() => {
                          setUrlCopied(false);
                        }, 5000);
                      });
                    }}
                  >
                    {urlCopied ? t('copied') : t('copy')}
                  </Button>
                }
                value={reportUrl}
                onFocus={(e) => {
                  e.target.select();
                }}
              />
            </Modal>
          </Box>
        </Box>
        <Tabs
          defaultActiveKey="summary"
          activeKey={activeTab}
          onChange={(key) => {
            setActiveTab(key);
            logAnalyticsEvent('event_SwitchCombatReportTab', {
              tab: key,
            });
          }}
        >
          <Tabs.TabPane tab={t('combat-report-summary')} key="summary" className={styles['combat-report-tab-content']}>
            <CombatSummary />
          </Tabs.TabPane>
          <Tabs.TabPane tab={t('combat-report-players')} key="players" className={styles['combat-report-tab-content']}>
            <CombatPlayers combat={combat} activePlayerId={activePlayerId} />
          </Tabs.TabPane>
          <Tabs.TabPane tab={t('combat-report-death')} key="death" className={styles['combat-report-tab-content']}>
            <DeathReports combat={combat} />
          </Tabs.TabPane>
          <Tabs.TabPane tab={t('combat-report-curves')} key="curves" className={styles['combat-report-tab-content']}>
            <CombatCurves combat={combat} viewerIsOwner={anon} />
          </Tabs.TabPane>
          <Tabs.TabPane tab={t('combat-report-replay')} key="replay" className={styles['combat-report-tab-content']}>
            {combat.hasAdvancedLogging ? <CombatReplay key={combat.id} combat={combat} /> : <ReplayUnavailable />}
          </Tabs.TabPane>
          {canUseFeature(data?.me, 'combat-log-raw-view') && (
            <Tabs.TabPane
              tab={t('combat-report-log-view')}
              key="logview"
              className={styles['combat-report-tab-content']}
            >
              {<CombatLogView key={combat.id} combat={combat} />}
            </Tabs.TabPane>
          )}
        </Tabs>
      </Box>
    </CombatReportContextProvider>
  );
}
