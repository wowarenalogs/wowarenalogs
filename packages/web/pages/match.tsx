import { CombatReportFromStorage } from '@wowarenalogs/shared';
import { useRouter } from 'next/router';

const Page = () => {
  const router = useRouter();

  const { id, anon } = router.query;
  if (!id || typeof id !== 'string') {
    return null;
  }

  return <CombatReportFromStorage id={id} anon={anon === 'true'} />;
};

export default Page;
