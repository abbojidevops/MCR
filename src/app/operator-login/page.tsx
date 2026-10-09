import { Suspense } from 'react';
import OperatorLoginForm from './operator-login-form';

// Operator sign-in is a per-request screen (it reports live middleware state),
// and the client form reads ?next= from the URL.
export const dynamic = 'force-dynamic';

export default function OperatorLoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-slate-950">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-slate-700 border-t-blue-500" />
        </div>
      }
    >
      <OperatorLoginForm />
    </Suspense>
  );
}
