import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db/repository';
import { getAuthenticatedAccountId } from '@/lib/session';

export async function GET(req: NextRequest) {
  try {
    // Derive account identity exclusively from authenticated session (Part 1.2)
    const accountId = await getAuthenticatedAccountId(req);
    const jobs = db.getJobs(accountId);

    // Build CSV content matching the job board exactly (Part 1.1)
    const headers = [
      'Job ID',
      'Customer Name',
      'Customer Phone',
      'Trade',
      'Status',
      'Emergency',
      'Problem Description',
      'Address',
      'Estimated Value ($)',
      'Confirmed Actual Revenue ($)',
      'Created Date',
      'Completed Date',
      'Recovery Source',
      'Notes'
    ];

    const rows = jobs.map((job) => [
      `"${job.id}"`,
      `"${job.contact?.full_name || 'Unknown Caller'}"`,
      `"${job.contact?.phone_number || ''}"`,
      `"${job.trade}"`,
      `"${(job.status || '').toUpperCase()}"`,
      job.is_emergency ? 'YES' : 'NO',
      `"${(job.problem || '').replace(/"/g, '""')}"`,
      `"${(job.address || '').replace(/"/g, '""')}"`,
      job.estimated_value || 0,
      job.status === 'COMPLETED' ? (job.actual_value || 0) : 0,
      `"${new Date(job.created_at).toISOString()}"`,
      job.completed_time ? `"${new Date(job.completed_time).toISOString()}"` : '""',
      `"${job.recovery_source || 'Missed Call'}"`,
      `"${(job.notes || '').replace(/"/g, '""')}"`
    ]);

    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\r\n');

    return new NextResponse(csvContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="mcr-recovered-jobs-${new Date().toISOString().slice(0, 10)}.csv"`
      }
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
