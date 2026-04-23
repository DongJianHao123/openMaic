import { type NextRequest } from 'next/server';
import { apiSuccess, apiError, API_ERROR_CODES } from '@/lib/server/api-response';
import { createLogger } from '@/lib/logger';
import { initDatabaseTables, getMediaFilesByStage } from '@/lib/server/mysql';

const log = createLogger('ClassroomMediaFilesAPI');

export async function GET(req: NextRequest) {
  try {
    const id = req.nextUrl.searchParams.get('id');
    if (!id) {
      return apiError(API_ERROR_CODES.MISSING_REQUIRED_FIELD, 400, 'Missing required parameter: id');
    }

    await initDatabaseTables();
    const mediaFiles = await getMediaFilesByStage(id);

    // Convert Blob to base64 and extract elementId
    const mediaFilesWithBase64 = await Promise.all(
      mediaFiles.map(async (media) => {
        const base64 = Buffer.from(media.blob).toString('base64');
        // Extract elementId from compound key (stageId:elementId)
        const elementId = media.id.split(':').slice(1).join(':');
        return {
          elementId,
          base64,
          mimeType: media.mimeType,
          type: media.type,
        };
      })
    );

    log.info(`Returning ${mediaFilesWithBase64.length} media files for classroom: ${id}`);
    return apiSuccess({ mediaFiles: mediaFilesWithBase64 });
  } catch (error) {
    log.error('Failed to get classroom media:', error);
    const errorMsg = error instanceof Error ? error.message : 'Failed to get classroom media';
    return apiError(API_ERROR_CODES.INTERNAL_ERROR, 500, errorMsg);
  }
}
