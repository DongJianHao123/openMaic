import { NextRequest, NextResponse } from 'next/server';
import { getAudioFile, initDatabaseTables } from '@/lib/server/mysql';
import { createLogger } from '@/lib/logger';

const log = createLogger('ClassroomMySQLAudio');

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ audioId: string }> }
) {
  try {
    const { audioId } = await params;
    await initDatabaseTables();

    const audioRecord = await getAudioFile(audioId);
    if (!audioRecord) {
      return NextResponse.json({ error: 'Audio not found' }, { status: 404 });
    }

    // Determine MIME type based on format
    let mimeType = 'audio/mpeg'; // default to mp3
    switch (audioRecord.format.toLowerCase()) {
      case 'wav':
        mimeType = 'audio/wav';
        break;
      case 'ogg':
        mimeType = 'audio/ogg';
        break;
      case 'webm':
        mimeType = 'audio/webm';
        break;
      case 'aac':
        mimeType = 'audio/aac';
        break;
      case 'mp3':
      default:
        mimeType = 'audio/mpeg';
        break;
    }

    return new NextResponse(audioRecord.blob, {
      status: 200,
      headers: {
        'Content-Type': mimeType,
        'Content-Length': String(audioRecord.blob.length),
        'Cache-Control': 'public, max-age=86400, immutable',
      },
    });
  } catch (error) {
    log.error('Failed to serve audio from MySQL:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
