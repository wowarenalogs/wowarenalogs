/* eslint-disable turbo/no-undeclared-env-vars */
import { notarize } from '@electron/notarize';

exports.default = async function notarizing(context) {
  const { electronPlatformName, appOutDir } = context;
  if (
    electronPlatformName !== 'darwin' ||
    !process.env.APPLE_ID ||
    !process.env.APPLE_TEAM_ID ||
    !process.env.APPLE_APP_SPECIFIC_PASSWORD
  ) {
    return;
  }

  const appName = context.packager.appInfo.productFilename;
  return await notarize({
    appBundleId: 'com.wowarenalogs.client',
    appPath: `${appOutDir}/${appName}.app`,
    appleId: process.env.APPLE_ID,
    appleIdPassword: process.env.APPLE_APP_SPECIFIC_PASSWORD,
    teamId: process.env.APPLE_TEAM_ID,
  });
};
