import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db/repository';
import { JobStatus } from '@/types';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const accountId = searchParams.get('accountId') || 'acc-apex-plumbing';
    const status = searchParams.get('status') as JobStatus | null;

    let jobs = db.getJobs(accountId);
    if (status) {
      jobs = jobs.filter((j) => j.status === status);
    }

    return NextResponse.json({ jobs });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { accountId, jobId, status, actualValue, notes } = body;

    if (!jobId || !status) {
      return NextResponse.json({ error: 'jobId and status are required' }, { status: 400 });
    }

    const targetAccount = accountId || 'acc-apex-plumbing';
    const updatedJob = db.updateJobStatus(targetAccount, jobId, status as JobStatus, actualValue);

    if (notes !== undefined) {
      updatedJob.notes = notes;
    }

    // Add audit log
    db.logAudit(targetAccount, 'UPDATE_JOB_STATUS', { jobId, newStatus: status, actualValue });

    return NextResponse.json({ success: true, job: updatedJob });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
