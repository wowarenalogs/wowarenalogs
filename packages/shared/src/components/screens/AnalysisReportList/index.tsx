import { Card, CardProps } from 'antd';
import moment from 'moment';
import Link from 'next/link';
import React from 'react';

import styles from './index.module.css';

import { IAnalysisReport } from '../../../types/IAnalysisReport';
import { Box } from '../../common/Box';

interface IProps {
  reports: IAnalysisReport[];
}

const LinkCard = React.forwardRef(function LinkCard(props: CardProps, ref) {
  return <Card {...props}>{props.children}</Card>;
});

export function AnalysisReportList({ reports }: IProps) {
  return (
    <Box className={styles.reports} display="flex" flexDirection="column" alignItems="flex-start">
      {reports.map((report) => (
        <Box key={report.id} className={styles.reportSummary} mt={2}>
          <Link href={`/analysis/report/${report.Slug}`}>
            <LinkCard hoverable>
              <Card.Meta title={report.Title} description={moment(report.published_at).calendar()} />
            </LinkCard>
          </Link>
        </Box>
      ))}
    </Box>
  );
}
