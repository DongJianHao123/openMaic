import { type NextRequest } from 'next/server';
import { apiSuccess, apiError } from '@/lib/server/api-response';
import { createLogger } from '@/lib/logger';
import { initDatabaseTables, getAudioFilesForClassroom } from '@/lib/server/mysql';

const log = createLogger('ClassroomAudioAPI');

export async function GET(req: NextRequest) {
  try {
    const id = req.nextUrl.searchParams.get('id');
    if (!id) {
      return apiError('Missing required parameter: id', 400);
    }

    await initDatabaseTables();
    const audioFiles = await getAudioFilesForClassroom(id);

    // Convert Blob to base64
    const audioFilesWithBase64 = await Promise.all(
      audioFiles.map(async (audio) => {
        const base64 = Buffer.from(audio.blob).toString('base64');
        return {
          audioId: audio.id,
          base64,
          format: audio.format,
          duration: audio.duration,
          text: audio.text,
          voice: audio.voice,
        };
      })
    );

    log.info(`Returning ${audioFilesWithBase64.length} audio files for classroom: ${id}`);
    return apiSuccess({ audioFiles: audioFilesWithBase64 });
  } catch (error) {
    log.error('Failed to get classroom audio:', error);
    return apiError('Failed to get classroom audio', 500);
  }
}
