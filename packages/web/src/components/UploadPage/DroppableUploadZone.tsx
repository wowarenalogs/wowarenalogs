import { Box, logAnalyticsEvent, Utils } from '@wowarenalogs/shared';
import { Spin, Empty, Modal, Typography, Upload } from 'antd';
import { RcFile } from 'antd/lib/upload';
import { useTranslation } from 'next-i18next';
import { useState, DragEvent, useEffect } from 'react';
import { ICombatData } from 'wow-combat-log-parser';

import styles from './index.module.css';

type IProps = {
  onCombatsFound: (combats: ICombatData[]) => void;
};

export const DroppableUploadZone = ({ onCombatsFound }: IProps) => {
  const { t } = useTranslation();

  const [isDragging, setIsDragging] = useState(false);
  const [fileProcLoading, setFileProcLoading] = useState(false);
  const [isMac, setIsMac] = useState(false);
  useEffect(() => {
    setIsMac(navigator.platform.toUpperCase().indexOf('MAC') === 0);
  }, []);

  const uploadFiles = async (files: FileList | RcFile[]) => {
    const combats = await Utils.parseFromFileAsync(files[0]);
    setFileProcLoading(false);
    if (combats.length > 0) {
      logAnalyticsEvent('event_UploadCombatsFound', { count: combats.length });
      onCombatsFound(combats);
    } else {
      Modal.error({
        title: t('error'),
        content: t('upload-page-no-combats-found'),
      });
    }
  };

  const handleDrop = async (event: DragEvent) => {
    event.preventDefault();
    setFileProcLoading(true);
    setIsDragging(false);

    logAnalyticsEvent('event_UploadFileDrop');

    const dt = event.dataTransfer;
    const files = dt.files;

    if (files.length > 0) {
      uploadFiles(files);
    } else {
      Modal.error({
        title: t('error'),
        content: t('upload-page-no-file-found'),
      });
    }
  };

  const handleDragOver = (event: DragEvent) => {
    event.preventDefault();
    setIsDragging(true);
  };

  const handleDragEnter = (event: DragEvent) => {
    event.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (event: DragEvent) => {
    event.preventDefault();
    setIsDragging(false);
  };

  const beforeUpload = (file: RcFile, list: RcFile[]) => {
    uploadFiles(list);
    return false; // Don't use antd built in upload func
  };

  return (
    <Box
      className={isDragging ? styles.filehovered : ''}
      onDrop={handleDrop}
      onDragOver={(event) => handleDragOver(event)}
      onDragEnter={(event) => handleDragEnter(event)}
      onDragLeave={(event) => handleDragLeave(event)}
      style={{
        border: '1px solid rgb(67, 67, 67)',
        borderRadius: '4px',
      }}
      flex={1}
      my={2}
      display="flex"
      flexDirection="column"
      justifyContent="center"
      alignItems="center"
    >
      <Empty description={fileProcLoading ? t('loading') : t('upload-page-drop-file-here')}>
        {fileProcLoading ? (
          <Spin />
        ) : (
          <Box display={'flex'} flexDirection={'column'}>
            <Box mb={2} display={'flex'} flexDirection={'row'}>
              <Typography.Text type="secondary">{t('upload-page-not-sure')}</Typography.Text>
              <Typography.Text type="secondary" code>
                {isMac
                  ? 'Applications/World of Warcraft/_retail_/Logs'
                  : 'C:\\Program Files (x86)\\World of Warcraft\\_retail_\\Logs'}
              </Typography.Text>
            </Box>
            <Upload beforeUpload={beforeUpload} showUploadList={false}>
              <Typography.Text type="secondary">{t('upload-page-manual-upload-cta')}</Typography.Text>
            </Upload>
          </Box>
        )}
      </Empty>
    </Box>
  );
};
