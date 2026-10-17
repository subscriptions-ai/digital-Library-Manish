import { PageHeader } from '../ui';
import { SecuritySettings } from '../SecuritySettings';

/** Admin > My Account: the signed-in administrator's own sign-in email and password. */
export function MyAccount() {
  return (
    <div className="max-w-2xl space-y-6 pb-12">
      <PageHeader className="mb-0" title="My Account" description="Your own sign-in email and password. Changing either signs you out of other devices." />
      <SecuritySettings allowEmailChange />
    </div>
  );
}
