import { type NextRequest } from 'next/server';
import { randomUUID } from 'crypto';
import { apiSuccess, apiError, API_ERROR_CODES } from '@/lib/server/api-response';
import {
  buildRequestOrigin,
  isValidClassroomId,
  persistClassroom,
  readClassroom,
  saveClassroomAudio,
  updateScenesWithAudioUrls,
  saveClassroomMedia,
  updateScenesWithMediaUrls,
} from '@/lib/server/classroom-storage';
import {
  initDatabaseTables,
  saveStage,
  saveScenes,
  saveAudioFile,
  saveMediaFile,
  getStage,
  getScenes,
} from '@/lib/server/mysql';
import { createLogger } from '@/lib/logger';
import type { Scene } from '@/lib/types/stage';

const log = createLogger('Classroom API');

export async function POST(request: NextRequest) {
  let stageId: string | undefined;
  let sceneCount: number | undefined;
  try {
    const body = await request.json();
    const { stage, scenes, audioFiles, mediaFiles } = body;
    stageId = stage?.id;
    sceneCount = scenes?.length;

    if (!stage || !scenes) {
      return apiError(
        API_ERROR_CODES.MISSING_REQUIRED_FIELD,
        400,
        'Missing required fields: stage, scenes',
      );
    }

    const id = stage.id || randomUUID();
    const baseUrl = buildRequestOrigin(request);
    const now = Date.now();

    await initDatabaseTables();

    let updatedScenes = scenes as Scene[];

    // Save media files (images/videos) if provided and update scenes
    if (mediaFiles && Array.isArray(mediaFiles) && mediaFiles.length > 0) {
      try {
        const mediaUrlMap = await saveClassroomMedia(id, mediaFiles, baseUrl);
        updatedScenes = updateScenesWithMediaUrls(updatedScenes, mediaUrlMap);
        log.info(`Saved ${mediaFiles.length} media files for classroom: ${id}`);

        // Also save media files directly to MySQL
        for (const media of mediaFiles) {
          const buffer = Buffer.from(media.base64, 'base64');
          const recordId = `${id}:${media.elementId}`;
          await saveMediaFile({
            id: recordId,
            stageId: id,
            type: media.type,
            blob: buffer,
            mimeType: media.mimeType,
            size: buffer.length,
            createdAt: now,
          });
        }
      } catch (mediaError) {
        log.warn('Failed to save media files, continuing without media:', mediaError);
      }
    }

    // Save audio files if provided and update scenes with audioUrl
    if (audioFiles && Array.isArray(audioFiles) && audioFiles.length > 0) {
      try {
        const audioUrlMap = await saveClassroomAudio(id, audioFiles, baseUrl);
        updatedScenes = updateScenesWithAudioUrls(updatedScenes, audioUrlMap);
        log.info(`Saved ${audioFiles.length} audio files for classroom: ${id}`);

        // Also save audio files directly to MySQL
        for (const audio of audioFiles) {
          const buffer = Buffer.from(audio.base64, 'base64');
          await saveAudioFile({
            id: audio.audioId,
            blob: buffer,
            duration: audio.duration,
            format: audio.format,
            text: audio.text,
            voice: audio.voice,
            createdAt: now,
          });
        }
      } catch (audioError) {
        log.warn('Failed to save audio files, continuing without audio:', audioError);
      }
    }

    // Save structured data to MySQL (new tables)
    try {
      // Save stage
      await saveStage({
        id,
        name: stage.name || 'Untitled Stage',
        description: stage.description,
        createdAt: stage.createdAt || now,
        updatedAt: now,
        language: stage.language,
        style: stage.style,
        currentSceneId: scenes[0]?.id,
        agentIds: stage.agentIds,
        generatedAgentConfigs: stage.generatedAgentConfigs,
      });

      // Save scenes
      const sceneRecords = updatedScenes.map((scene, index) => ({
        id: scene.id,
        stageId: id,
        type: scene.type,
        title: scene.title,
        order: scene.order ?? index,
        content: scene.content,
        actions: scene.actions,
        whiteboards: scene.whiteboards,
        createdAt: (scene as any).createdAt || now,
        updatedAt: (scene as any).updatedAt || now,
      }));
      await saveScenes(id, sceneRecords);

      log.info(`Saved structured data for classroom: ${id}`);
    } catch (structError) {
      log.warn('Failed to save structured data, falling back to legacy only:', structError);
    }

    const persisted = await persistClassroom({ id, stage: { ...stage, id }, scenes: updatedScenes }, baseUrl);

    return apiSuccess({ id: persisted.id, url: persisted.url }, 201);
  } catch (error) {
    log.error(
      `Classroom storage failed [stageId=${stageId ?? 'unknown'}, scenes=${sceneCount ?? 0}]:`,
      error,
    );
    return apiError(
      API_ERROR_CODES.INTERNAL_ERROR,
      500,
      'Failed to store classroom',
      error instanceof Error ? error.message : String(error),
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const id = request.nextUrl.searchParams.get('id');

    if (!id) {
      return apiError(
        API_ERROR_CODES.MISSING_REQUIRED_FIELD,
        400,
        'Missing required parameter: id',
      );
    }

    if (!isValidClassroomId(id)) {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, 'Invalid classroom id');
    }

    await initDatabaseTables();

    // First try to read from new structured tables
    let classroom;
    try {
      const stageRecord = await getStage(id);
      if (stageRecord) {
        const scenes = await getScenes(id);
        if (scenes.length > 0) {
          const stage = {
            id: stageRecord.id,
            name: stageRecord.name,
            description: stageRecord.description,
            createdAt: stageRecord.createdAt,
            updatedAt: stageRecord.updatedAt,
            language: stageRecord.language,
            style: stageRecord.style,
            agentIds: stageRecord.agentIds,
            generatedAgentConfigs: stageRecord.generatedAgentConfigs,
          };
          classroom = {
            id,
            stage,
            scenes: scenes.map((s) => ({
              id: s.id,
              type: s.type,
              title: s.title,
              order: s.order,
              content: s.content,
              actions: s.actions,
              whiteboards: s.whiteboards,
            })),
            createdAt: new Date(stageRecord.createdAt).toISOString(),
          };
          log.info('Loaded classroom from new structured MySQL tables:', id);
        }
      }
    } catch (structErr) {
      log.warn('Failed to load from structured tables, falling back to legacy:', structErr);
    }

    // If not found in new tables, try legacy method
    if (!classroom) {
      classroom = await readClassroom(id);
    }

    if (!classroom) {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 404, 'Classroom not found');
    }

    return apiSuccess({ classroom });
  } catch (error) {
    log.error(
      `Classroom retrieval failed [id=${request.nextUrl.searchParams.get('id') ?? 'unknown'}]:`,
      error,
    );
    return apiError(
      API_ERROR_CODES.INTERNAL_ERROR,
      500,
      'Failed to retrieve classroom',
      error instanceof Error ? error.message : String(error),
    );
  }
}
