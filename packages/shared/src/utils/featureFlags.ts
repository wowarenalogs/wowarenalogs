import { GetProfileQuery } from '../graphql/__generated__/graphql';

export const features = {
  skipUploads: 'skip-log-uploads',
};

export const canUseFeature = (flag: string, user?: GetProfileQuery | undefined, localFlags?: string[]) => {
  if (user && user?.me?.tags?.includes(flag)) {
    return true;
  }
  if (localFlags && localFlags.includes(flag)) {
    return true;
  }
  return false;
};
