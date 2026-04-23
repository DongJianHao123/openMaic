import { promises as fs } from 'fs';
import path from 'path';
import type { NextRequest } from 'next/server';
import type { Scene, Stage } from '@/lib/types/stage';
import type { SpeechAction } from '@/lib/types/action';
import {
  getClassroomFromMysql,
  saveClassroomToMysql,
  initMaicClassroomTable,
  saveAudioFile,
  saveMediaFile,
  getAudioFile,
  getMediaFile,
  getMediaFilesByStage,
} from './mysql';
import { createLogger } from '@/lib/logger';

const log = createLogger('ClassroomStorage');

export const CLASSROOMS_DIR = path.join(process.cwd(), 'data', 'classrooms');
export const CLASSROOM_JOBS_DIR = path.join(process.cwd(), 'data', 'classroom-jobs');

// Flag to use MySQL instead of file storage
const USE_MYSQL = true;

async function ensureDir(dir: string) {
  await fs.mkdir(dir, { recursive: true });
}

export async function ensureClassroomsDir() {
  await ensureDir(CLASSROOMS_DIR);
}

export async function ensureClassroomJobsDir() {
  await ensureDir(CLASSROOM_JOBS_DIR);
}

export async function writeJsonFileAtomic(filePath: string, data: unknown) {
  const dir = path.dirname(filePath);
  await ensureDir(dir);

  const tempFilePath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  const content = JSON.stringify(data, null, 2);
  await fs.writeFile(tempFilePath, content, 'utf-8');
  await fs.rename(tempFilePath, filePath);
}

export function buildRequestOrigin(req: NextRequest): string {
  return req.headers.get('x-forwarded-host')
    ? `${req.headers.get('x-forwarded-proto') || 'http'}://${req.headers.get('x-forwarded-host')}`
    : req.nextUrl.origin;
}

export interface PersistedClassroomData {
  id: string;
  stage: Stage;
  scenes: Scene[];
  createdAt: string;
}

export function isValidClassroomId(id: string): boolean {
  return /^[a-zA-Z0-9_-]+$/.test(id);
}

export async function readClassroom(id: string): Promise<PersistedClassroomData | null> {
  if (USE_MYSQL) {
    try {
      await initMaicClassroomTable();
      const result = await getClassroomFromMysql(id);
      if (result) {
        return {
          id: result.id,
          stage: result.stage as Stage,
          scenes: result.scenes as Scene[],
          createdAt: result.createdAt.toISOString(),
        };
      }
      return null;
    } catch (error) {
      log.error('Failed to read from MySQL, falling back to file:', error);
    }
  }

  // Fallback to file storage
  const filePath = path.join(CLASSROOMS_DIR, `${id}.json`);
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(content) as PersistedClassroomData;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

export async function persistClassroom(
  data: {
    id: string;
    stage: Stage;
    scenes: Scene[];
  },
  baseUrl: string,
): Promise<PersistedClassroomData & { url: string }> {
  const classroomData: PersistedClassroomData = {
    id: data.id,
    stage: data.stage,
    scenes: data.scenes,
    createdAt: new Date().toISOString(),
  };

  if (USE_MYSQL) {
    try {
      await initMaicClassroomTable();
      await saveClassroomToMysql(data.id, data.stage, data.scenes);
      log.info('Classroom saved to MySQL:', data.id);
      return {
        ...classroomData,
        url: `${baseUrl}/classroom/share/${data.id}`,
      };
    } catch (error) {
      log.error('Failed to save to MySQL, falling back to file:', error);
    }
  }

  // Fallback to file storage
  await ensureClassroomsDir();
  const filePath = path.join(CLASSROOMS_DIR, `${data.id}.json`);
  await writeJsonFileAtomic(filePath, classroomData);

  return {
    ...classroomData,
    url: `${baseUrl}/classroom/share/${data.id}`,
  };
}

/**
 * Save audio files for a classroom and update scenes with audioUrl
 */
export async function saveClassroomAudio(
  classroomId: string,
  audioFiles: Array<{ audioId: string; base64: string; format: string; duration?: number; text?: string; voice?: string }>,
  baseUrl: string,
): Promise<Map<string, string>> {
  const audioUrlMap = new Map<string, string>();

  if (USE_MYSQL) {
    try {
      await initMaicClassroomTable();
      for (const { audioId, base64, format, duration, text, voice } of audioFiles) {
        const buffer = Buffer.from(base64, 'base64');
        await saveAudioFile({
          id: audioId,
          blob: buffer,
          duration,
          format,
          text,
          voice,
          createdAt: Date.now(),
        });
        // New API endpoint for MySQL-stored audio
        const audioUrl = `${baseUrl}/api/classroom-mysql/audio/${audioId}`;
        audioUrlMap.set(audioId, audioUrl);
        log.info(`Saved audio to MySQL: ${audioId} (${buffer.length} bytes)`);
      }
      return audioUrlMap;
    } catch (error) {
      log.error('Failed to save audio to MySQL, falling back to file:', error);
    }
  }

  // Fallback to file storage
  const audioDir = path.join(CLASSROOMS_DIR, classroomId, 'audio');
  await ensureDir(audioDir);

  for (const { audioId, base64, format } of audioFiles) {
    const filename = `${audioId}.${format}`;
    const filePath = path.join(audioDir, filename);
    const buffer = Buffer.from(base64, 'base64');
    await fs.writeFile(filePath, buffer);
    const audioUrl = `${baseUrl}/api/classroom-media/${classroomId}/audio/${filename}`;
    audioUrlMap.set(audioId, audioUrl);
    log.info(`Saved audio: ${filename} (${buffer.length} bytes)`);
  }

  return audioUrlMap;
}

/**
 * Update scenes with audio URLs
 */
export function updateScenesWithAudioUrls(
  scenes: Scene[],
  audioUrlMap: Map<string, string>,
): Scene[] {
  const updatedScenes = JSON.parse(JSON.stringify(scenes)) as Scene[];

  for (const scene of updatedScenes) {
    if (!scene.actions) continue;

    for (const action of scene.actions) {
      if (action.type === 'speech') {
        const speechAction = action as SpeechAction;
        if (speechAction.audioId && audioUrlMap.has(speechAction.audioId)) {
          speechAction.audioUrl = audioUrlMap.get(speechAction.audioId);
        }
      }
    }
  }

  return updatedScenes;
}

/**
 * Save media files (images/videos) for a classroom
 */
export async function saveClassroomMedia(
  classroomId: string,
  mediaFiles: Array<{ elementId: string; base64: string; mimeType: string; type: 'image' | 'video' }>,
  baseUrl: string,
): Promise<Map<string, string>> {
  const mediaUrlMap = new Map<string, string>();

  if (USE_MYSQL) {
    try {
      await initMaicClassroomTable();
      for (const { elementId, base64, mimeType, type } of mediaFiles) {
        const buffer = Buffer.from(base64, 'base64');
        const recordId = `${classroomId}:${elementId}`;
        await saveMediaFile({
          id: recordId,
          stageId: classroomId,
          type,
          blob: buffer,
          mimeType,
          size: buffer.length,
          createdAt: Date.now(),
        });
        // New API endpoint for MySQL-stored media
        const mediaUrl = `${baseUrl}/api/classroom-mysql/media/${classroomId}/${elementId}`;
        mediaUrlMap.set(elementId, mediaUrl);
        log.info(`Saved media to MySQL: ${recordId} (${buffer.length} bytes)`);
      }
      return mediaUrlMap;
    } catch (error) {
      log.error('Failed to save media to MySQL, falling back to file:', error);
    }
  }

  // Fallback to file storage
  const mediaDir = path.join(CLASSROOMS_DIR, classroomId, 'media');
  await ensureDir(mediaDir);

  for (const { elementId, base64, mimeType, type } of mediaFiles) {
    // Get file extension from mimeType
    const ext = mimeType.split('/')[1] || (type === 'image' ? 'png' : 'mp4');
    const filename = `${elementId}.${ext}`;
    const filePath = path.join(mediaDir, filename);
    const buffer = Buffer.from(base64, 'base64');
    await fs.writeFile(filePath, buffer);
    const mediaUrl = `${baseUrl}/api/classroom-media/${classroomId}/media/${filename}`;
    mediaUrlMap.set(elementId, mediaUrl);
    log.info(`Saved media: ${filename} (${buffer.length} bytes)`);
  }

  return mediaUrlMap;
}

/**
 * Update scenes with media URLs
 */
export function updateScenesWithMediaUrls(
  scenes: Scene[],
  mediaUrlMap: Map<string, string>,
): Scene[] {
  const updatedScenes = JSON.parse(JSON.stringify(scenes)) as Scene[];

  for (const scene of updatedScenes) {
    if (scene.type !== 'slide') continue;
    const canvas = (scene.content as { canvas?: { elements?: Array<{ id: string; src?: string; type?: string }> } })?.canvas;
    if (!canvas?.elements) continue;

    for (const el of canvas.elements) {
      if ((el.type === 'image' || el.type === 'video') && typeof el.src === 'string') {
        if (mediaUrlMap.has(el.src)) {
          el.src = mediaUrlMap.get(el.src)!;
        }
      }
    }
  }

  return updatedScenes;
}
