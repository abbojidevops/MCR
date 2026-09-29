import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db/repository';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const accountId = searchParams.get('accountId') || 'acc-apex-plumbing';
    const jobs = db.getJobs(accountId);

    // Build CSV content
    const headers = [
      'Job ID',
      'Customer Phone',
      'Trade',
      'Status',
      'Emergency',
      'Problem Description',
      'Address',
      'Estimated Value ($)',
      'Actual Recovered Value ($)',
      'Created Date',
      'Notes'
    ];

    const rows = jobs.map((job) => [
      `"${job.id}"`,
      `"${job.contact?.phone_number || ''}"`,
      `"${job.trade}"`,
      `"${job.status}"`,
      job.is_emergency ? 'YES' : 'NO',
      `"${(job.problem || '').replace(/"/g, '""')}"`,
      `"${(job.address || '').replace(/"/g, '""')}"`,
      job.estimated_value || 0,
      job.actual_value || 0,
      `"${new Date(job.created_at).toISOString()}"`,
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
