import { Editor } from '@wowarenalogs/shared';
import { ProfilePage } from '@wowarenalogs/shared/src/components/pages/ProfilePage';

export default function Page() {
  return (
    <Editor />
    // <ProfilePage
    //   onLogout={() => {
    //     if (window.wowarenalogs?.app?.clearStorage) {
    //       return window.wowarenalogs.app.clearStorage();
    //     }
    //     return Promise.resolve();
    //   }}
    // />
  );
}
