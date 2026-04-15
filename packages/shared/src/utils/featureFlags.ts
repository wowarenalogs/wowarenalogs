import { GetProfileQuery } from '../graphql/__generated__/graphql';

export const features = {
  /** Allows user to disable uploading of matches. Only allowed in rare cases. */
  skipUploads: 'skip-log-uploads',
  /** Allows user to see AWC bracket on search pages */
  awcSearch: 'awc-search',
  /** Allows user to see the Mistakes analysis tab on combat replays */
  mistakesTab: 'mistakes-tab',
};

export const canUseFeature = (flag: string, user?: GetProfileQuery | undefined | null, localFlags?: string[]) => {
  if (user && user?.me?.tags?.includes(flag)) {
    return true;
  }
  if (localFlags && localFlags.includes(flag)) {
    return true;
  }
  return false;
};
