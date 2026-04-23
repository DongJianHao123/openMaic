import { NextRequest, NextResponse } from 'next/server';
import { getMediaFile, initDatabaseTables } from '@/lib/server/mysql';
import { createLogger } from '@/lib/logger';

const log = createLogger('ClassroomMySQLMedia');

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ classroomId: string; elementId: string }> }
) {
  try {
    const { classroomId, elementId } = await params;
    await initDatabaseTables();

    const recordId = `${classroomId}:${elementId}`;
    const mediaRecord = await getMediaFile(recordId);
    if (!mediaRecord) {
      return NextResponse.json({ error: 'Media not found' }, { status: 404 });
    }

    return new NextResponse(mediaRecord.blob, {
      status: 200,
      headers: {
        'Content-Type': mediaRecord.mimeType,
        'Content-Length': String(mediaRecord.size),
        'Cache-Control': 'public, max-age=86400, immutable',
      },
    });
  } catch (error) {
    log.error('Failed to serve media from MySQL:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
