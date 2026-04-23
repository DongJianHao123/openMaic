/**
 * Server Sync Utilities
 *
 * Functions to sync local IndexedDB classrooms to server storage
 * Note: Media upload to COS is handled separately in the ShareClassroomButton component
 */

import { createLogger } from '@/lib/logger';
import { loadStageData } from './stage-storage';
import { db, mediaFileKey } from './database';
import type { Scene } from '@/lib/types/stage';
import type { SpeechAction } from '@/lib/types/action';

const log = createLogger('ServerSync');

export interface SyncToServerResult {
  success: boolean;
  id?: string;
  url?: string;
  error?: string;
}

/**
 * Convert Blob to base64 string
 */
async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64 = (reader.result as string).split(',')[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * Collect audio files from IndexedDB for a classroom
 */
async function collectAudioFiles(stageId: string, scenes: Scene[]): Promise<
  Array<{ audioId: string; base64: string; format: string; duration?: number; text?: string; voice?: string }>
> {
  const audioFiles: Array<{ audioId: string; base64: string; format: string; duration?: number; text?: string; voice?: string }> = [];

  // Collect all audioIds from speech actions
  const audioIds = new Set<string>();
  for (const scene of scenes) {
    if (!scene.actions) continue;
    for (const action of scene.actions) {
      if (action.type === 'speech') {
        const speechAction = action as SpeechAction;
        if (speechAction.audioId) {
          audioIds.add(speechAction.audioId);
        }
      }
    }
  }

  if (audioIds.size === 0) {
    log.info('No audio files found for classroom:', stageId);
    return audioFiles;
  }

  // Fetch audio files from IndexedDB
  log.info(`Collecting ${audioIds.size} audio files...`);
  for (const audioId of audioIds) {
    try {
      const audioRecord = await db.audioFiles.get(audioId);
      if (audioRecord && audioRecord.blob) {
        const base64 = await blobToBase64(audioRecord.blob);
        const format = audioRecord.format || 'mp3';
        audioFiles.push({
          audioId,
          base64,
          format,
          duration: audioRecord.duration,
          text: audioRecord.text,
          voice: audioRecord.voice,
        });
        log.info(`Collected audio: ${audioId}`);
      }
    } catch (err) {
      log.warn(`Failed to collect audio ${audioId}:`, err);
    }
  }

  return audioFiles;
}

/**
 * Collect media files (images/videos) from IndexedDB for a classroom
 */
async function collectMediaFiles(stageId: string, scenes: Scene[]): Promise<
  Array<{ elementId: string; base64: string; mimeType: string; type: 'image' | 'video' }>
> {
  const mediaFiles: Array<{ elementId: string; base64: string; mimeType: string; type: 'image' | 'video' }> = [];

  // Collect all media elementIds from scenes
  const elementIds = new Set<string>();
  for (const scene of scenes) {
    if (scene.type !== 'slide') continue;
    const canvas = (scene.content as { canvas?: { elements?: Array<{ id: string; src?: string; type?: string }> } })?.canvas;
    if (!canvas?.elements) continue;

    for (const el of canvas.elements) {
      if ((el.type === 'image' || el.type === 'video') && typeof el.src === 'string') {
        // Only collect placeholder IDs like gen_img_xxx or gen_vid_xxx
        if (/^gen_(img|vid)_[\w-]+$/i.test(el.src)) {
          elementIds.add(el.src);
        }
      }
    }
  }

  if (elementIds.size === 0) {
    log.info('No media files found for classroom:', stageId);
    return mediaFiles;
  }

  // Fetch media files from IndexedDB
  log.info(`Collecting ${elementIds.size} media files...`);
  for (const elementId of elementIds) {
    try {
      const mediaKey = mediaFileKey(stageId, elementId);
      const mediaRecord = await db.mediaFiles.get(mediaKey);
      if (mediaRecord && mediaRecord.blob) {
        const base64 = await blobToBase64(mediaRecord.blob);
        mediaFiles.push({
          elementId,
          base64,
          mimeType: mediaRecord.mimeType,
          type: mediaRecord.type,
        });
        log.info(`Collected media: ${elementId}`);
      }
    } catch (err) {
      log.warn(`Failed to collect media ${elementId}:`, err);
    }
  }

  return mediaFiles;
}

/**
 * Upload a local classroom to server storage
 * @param stageId The local stage ID to upload
 */
export async function syncClassroomToServer(
  stageId: string,
): Promise<SyncToServerResult> {
  try {
    log.info('Syncing classroom to server:', stageId);

    // Load the full classroom data from IndexedDB
    const stageData = await loadStageData(stageId);
    if (!stageData) {
      return {
        success: false,
        error: 'Classroom not found in local storage',
      };
    }

    // Collect audio and media files from IndexedDB
    const [audioFiles, mediaFiles] = await Promise.all([
      collectAudioFiles(stageId, stageData.scenes),
      collectMediaFiles(stageId, stageData.scenes),
    ]);

    // Prepare data for server
    const payload = {
      stage: stageData.stage,
      scenes: stageData.scenes,
      audioFiles: audioFiles.length > 0 ? audioFiles : undefined,
      mediaFiles: mediaFiles.length > 0 ? mediaFiles : undefined,
    };

    log.info('Uploading classroom to server...', {
      audioCount: audioFiles.length,
      mediaCount: mediaFiles.length,
    });

    // Send to the existing classroom API
    const response = await fetch('/api/classroom', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const result = await response.json();

    if (!response.ok) {
      return {
        success: false,
        error: result.error || 'Failed to upload classroom',
      };
    }

    log.info('Classroom synced successfully:', result);

    return {
      success: true,
      id: result.id,
      url: result.url,
    };
  } catch (error) {
    log.error('Failed to sync classroom to server:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Check if server storage is available (simply tries to ping the API)
 */
export async function isServerStorageAvailable(): Promise<boolean> {
  try {
    const response = await fetch('/api/health');
    return response.ok;
  } catch {
    return false;
  }
}
