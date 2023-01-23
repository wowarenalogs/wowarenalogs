import { ProfilePage } from '@wowarenalogs/shared/src/components/pages/ProfilePage';

export default function Page() {
  return (
    <ProfilePage
      onLogout={() => {
        return;
      }}
    />
  );
}
