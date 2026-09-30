import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db/repository';
import { JobStatus } from '@/types';
import { getAuthenticatedAccountId } from '@/lib/session';

export async function GET(req: NextRequest) {
  try {
    // Derive account identity exclusively from authenticated session (Part 1.2)
    const accountId = await getAuthenticatedAccountId(req);
    const { searchParams } = new URL(req.url);
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
    // Derive account identity exclusively from authenticated session (Part 1.2)
    const accountId = await getAuthenticatedAccountId(req);
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

    // Add audit log
    db.logAudit(accountId, 'UPDATE_JOB', { jobId, updates });

    return NextResponse.json({ success: true, job: updatedJob });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
