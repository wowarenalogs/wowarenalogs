import { CopyOutlined, ShareAltOutlined, UnlockOutlined } from '@ant-design/icons';
import { Spin, Space, Statistic, Button, Modal, Input } from 'antd';
import Text from 'antd/lib/typography/Text';
import Title from 'antd/lib/typography/Title';
import _ from 'lodash';
import { useTranslation, Trans } from 'next-i18next';
import Link from 'next/link';
import React, { useEffect, useMemo, useState } from 'react';
import AutoSizer from 'react-virtualized-auto-sizer';
import { FixedSizeList } from 'react-window';
import InfiniteLoader from 'react-window-infinite-loader';
import { CombatResult } from 'wow-combat-log-parser';

import { CombatDataStub } from '../../../graphql/__generated__/graphql';
import { logAnalyticsEvent } from '../../../utils/analytics';
import { Box } from '../Box';
import { Row } from './Row';

export interface IProps {
  header?: string;
  showSummary?: boolean;
  viewerIsOwner?: boolean;
  combats: CombatDataStub[];
  hasNextPage?: boolean;
  loadNextPage?: (startIndex: number, stopIndex: number) => Promise<void>;
  combatUrlFactory: (id: string) => string;
  queryLimitReached: boolean;
  applyUtcFix?: boolean;
  loading?: boolean;
  shareableUserId?: string;
}

export function InfiniteCombatDataStubList({
  header,
  combats,
  hasNextPage,
  loadNextPage,
  combatUrlFactory,
  applyUtcFix,
  loading,
  queryLimitReached,
  shareableUserId,
  viewerIsOwner = true,
  showSummary = true,
}: IProps) {
  const { t } = useTranslation();

  const shareableUrl = useMemo(() => {
    const url = shareableUserId ? `https://wowarenalogs.com/matches/user/${shareableUserId}` : null;
    return url;
  }, [shareableUserId]);
  const [showShareModal, setShowShareModal] = useState(false);
  const [urlCopied, setUrlCopied] = useState(false);

  useEffect(() => {
    if (queryLimitReached) {
      logAnalyticsEvent('view_RareFeaturePromotion');
    }
  }, [queryLimitReached]);

  const itemCount = hasNextPage ? combats.length + 1 : combats.length;

  const loadMoreItems =
    !loading && loadNextPage
      ? loadNextPage
      : () => {
          return;
        };

  const isItemLoaded = (index: number) => !hasNextPage || index < combats.length;

  // Render an item or a loading indicator.
  const Item = (p: { index: number; style: React.CSSProperties }) => {
    if (!isItemLoaded(p.index)) {
      return (
        <Box display="flex" flexDirection="row" justifyContent="center" style={p.style}>
          <Spin />
        </Box>
      );
    }

    const combat = combats[p.index];
    return (
      <Row
        key={combat.id}
        style={p.style}
        combat={combat}
        applyUtcFix={applyUtcFix || false}
        viewerIsOwner={viewerIsOwner}
        combatUrlFactory={combatUrlFactory}
      />
    );
  };

  return (
    <Box flex={1} display="flex" flexDirection="column">
      {header && (
        <Box display="flex" flexDirection="row" alignItems="center">
          <Title level={2}>{header}</Title>
          {shareableUrl && (
            <Box pb={2}>
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
                title={t('combat-list-share-matches')}
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
                        navigator.clipboard.writeText(shareableUrl).then(() => {
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
                  value={shareableUrl}
                  onFocus={(e) => {
                    e.target.select();
                  }}
                />
              </Modal>
            </Box>
          )}
        </Box>
      )}
      {showSummary && (
        <Box display="flex" flexDirection="row" my={2}>
          <Space size="middle">
            <Statistic
              title={t('wins')}
              value={combats.filter((c) => c.result === CombatResult.Win).length}
              valueStyle={{ color: '#49aa19' }}
            />
            <Statistic
              title={t('losses')}
              value={combats.filter((c) => c.result === CombatResult.Lose).length}
              valueStyle={{ color: '#a61d24' }}
            />
          </Space>
        </Box>
      )}
      {queryLimitReached && (
        <Box mb={4} display="flex" flexDirection="column" alignItems="center">
          <Text type="secondary">{t('combat-list-upgrade-to-see-more')}</Text>
          <Link href="/profile">
            <Button type="default" icon={<UnlockOutlined />}>
              <Trans i18nKey="combat-list-unlock-rare-features">
                Unlock&nbsp;<span className="feature-rare">[Rare Features]</span>
              </Trans>
            </Button>
          </Link>
        </Box>
      )}
      <Box flex={1}>
        <InfiniteLoader isItemLoaded={isItemLoaded} itemCount={itemCount} loadMoreItems={loadMoreItems}>
          {({ onItemsRendered, ref }) => (
            <AutoSizer ref={ref}>
              {({ height, width }) => (
                <FixedSizeList
                  itemCount={itemCount}
                  onItemsRendered={onItemsRendered}
                  height={height}
                  width={width}
                  itemSize={60}
                >
                  {Item}
                </FixedSizeList>
              )}
            </AutoSizer>
          )}
        </InfiniteLoader>
      </Box>
    </Box>
  );
}
