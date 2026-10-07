import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db/repository';
import { JobStatus } from '@/types';
import { requireTenantAuth } from '@/lib/authz';
import { notFoundResponse } from '@/lib/api-errors';
import { dispatchCrmWebhook } from '@/lib/crm-webhook';

export async function GET(req: NextRequest) {
  try {
    const auth = await requireTenantAuth(req);
    if (auth instanceof NextResponse) return auth;
    const { accountId } = auth;

    const { searchParams } = new URL(req.url);
    const jobId = searchParams.get('jobId') || searchParams.get('id');

    if (jobId) {
      const job = db.getJob(accountId, jobId);
      if (!job) {
        return notFoundResponse();
      }
      return NextResponse.json({ job });
    }

    const status = searchParams.get('status') as JobStatus | null;
    let jobs = db.getJobs(accountId);
    if (status) {
      jobs = jobs.filter((j) => (j.status || '').toUpperCase() === status.toUpperCase());
    }

    return NextResponse.json({ jobs });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const auth = await requireTenantAuth(req);
    if (auth instanceof NextResponse) return auth;
    const { accountId } = auth;

    const body = await req.json();
    const { jobId, status, actualValue, estimatedValue, notes } = body;

    if (!jobId) {
      return NextResponse.json({ error: 'jobId is required' }, { status: 400 });
    }

    const updates: any = {};
    if (status) updates.status = status as JobStatus;
    if (actualValue !== undefined) updates.actual_value = Number(actualValue);
    if (estimatedValue !== undefined) updates.estimated_value = Number(estimatedValue);
    if (notes !== undefined) updates.notes = notes;

    const updatedJob = db.updateJob(accountId, jobId, updates);
    if (!updatedJob) {
      return notFoundResponse();
    }

    // Add audit log
    db.logAudit(accountId, 'UPDATE_JOB', { jobId, updates });

    // Outgoing CRM Webhook Dispatch
    if (status === 'BOOKED' || status === 'COMPLETED' || updates.status) {
      await dispatchCrmWebhook({
        accountId,
        event: status === 'BOOKED' ? 'job.booked' : 'job.updated',
        job: updatedJob,
      }).catch(() => {});
    }

    return NextResponse.json({ success: true, job: updatedJob });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
