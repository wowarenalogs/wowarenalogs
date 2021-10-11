import { RightOutlined } from '@ant-design/icons';
import { Button } from 'antd';
import Text from 'antd/lib/typography/Text';
import Title from 'antd/lib/typography/Title';
import moment from 'moment';
import { useTranslation } from 'next-i18next';
import { NextSeo } from 'next-seo';
import Link from 'next/link';
import ReactMarkdown from 'react-markdown';

import styles from './index.module.css';

import { IAnalysisReport } from '../../../types/IAnalysisReport';
import { Box } from '../../common/Box';

interface IProps {
  report: IAnalysisReport;
}

export function AnalysisReport({ report }: IProps) {
  const { t } = useTranslation();

  return (
    <Box className={styles.report} display="flex" flexDirection="column" alignItems="flex-start">
      <NextSeo
        title={report.Title}
        description={report.Summary}
        openGraph={{
          title: report.Title,
          description: report.Summary,
        }}
      />
      <Title level={3}>
        <Link href="/analysis/reports">
          <Button className={styles.backButton} type="text" size="large">
            {t('reports-page-title')}
          </Button>
        </Link>
        <Box className={styles.caret} display="inline-block" mx={1}>
          <Text type="secondary">
            <RightOutlined />
          </Text>
        </Box>
        {report.Title}
      </Title>
      <Box display="flex" flexDirection="row" justifyContent="flex-end">
        <Text type="secondary">{moment(report.published_at).calendar()}</Text>
      </Box>
      <Box pt={2}>
        <ReactMarkdown>{report.Body}</ReactMarkdown>
      </Box>
    </Box>
  );
}
