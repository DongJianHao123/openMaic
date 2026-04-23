/**
 * Data Migration API
 *
 * Migrate data from file storage and IndexedDB to MySQL
 * Note: IndexedDB is client-side, so client must send data via POST
 */

import { type NextRequest } from 'next/server';
import { apiSuccess, apiError, API_ERROR_CODES } from '@/lib/server/api-response';
import { createLogger } from '@/lib/logger';
import { promises as fs } from 'fs';
import { CLASSROOMS_DIR, readClassroom } from '@/lib/server/classroom-storage';
import {
  initDatabaseTables,
  saveClassroomToMysql,
  getClassroomFromMysql,
  saveStage,
  saveScenes,
  saveAudioFile,
  saveMediaFile,
  saveChatSessions,
  saveGeneratedAgents,
  type StageRecord,
  type SceneRecord,
  type AudioFileRecord,
  type MediaFileRecord,
  type ChatSessionRecord,
  type GeneratedAgentRecord,
} from '@/lib/server/mysql';

const log = createLogger('MigrateAPI');

export async function POST(request: NextRequest) {
  try {
    // Initialize database tables
    await initDatabaseTables();

    // Check if request has body (client-side data)
    const contentType = request.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      try {
        const body = await request.json();

        // If client sends data, use that
        if (body.stage && body.scenes) {
          return await saveClientDataToMySQL(body);
        }
      } catch {
        // No JSON body, continue with file migration
      }
    }

    // Default: migrate file-based classrooms
    const migratedCount = await migrateFileClassroomsToMySQL();

    return apiSuccess({
      message: 'Migration completed',
      migratedCount,
    });
  } catch (error) {
    log.error('Migration failed:', error);
    return apiError(
      API_ERROR_CODES.INTERNAL_ERROR,
      500,
      'Migration failed',
      error instanceof Error ? error.message : String(error),
    );
  }
}

async function saveClientDataToMySQL(body: {
  stage: StageRecord;
  scenes: SceneRecord[];
  audioFiles?: Array<{ id: string; base64: string; format: string; duration?: number; text?: string; voice?: string }>;
  mediaFiles?: Array<{ id: string; stageId: string; type: 'image' | 'video'; base64: string; mimeType: string; size: number }>;
  chatSessions?: ChatSessionRecord[];
  generatedAgents?: GeneratedAgentRecord[];
}) {
  const { stage, scenes, audioFiles, mediaFiles, chatSessions, generatedAgents } = body;
  const stageId = stage.id;

  log.info(`Saving client data for stage ${stageId} to MySQL...`);

  // Save stage
  await saveStage(stage);

  // Save scenes
  await saveScenes(stageId, scenes);

  // Save audio files
  if (audioFiles && audioFiles.length > 0) {
    for (const audio of audioFiles) {
      const record: AudioFileRecord = {
        id: audio.id,
        blob: Buffer.from(audio.base64, 'base64'),
        duration: audio.duration,
        format: audio.format,
        text: audio.text,
        voice: audio.voice,
        createdAt: Date.now(),
      };
      await saveAudioFile(record);
    }
    log.info(`Saved ${audioFiles.length} audio files`);
  }

  // Save media files
  if (mediaFiles && mediaFiles.length > 0) {
    for (const media of mediaFiles) {
      const record: MediaFileRecord = {
        id: media.id,
        stageId: media.stageId,
        type: media.type,
        blob: Buffer.from(media.base64, 'base64'),
        mimeType: media.mimeType,
        size: media.size,
        createdAt: Date.now(),
      };
      await saveMediaFile(record);
    }
    log.info(`Saved ${mediaFiles.length} media files`);
  }

  // Save chat sessions
  if (chatSessions && chatSessions.length > 0) {
    await saveChatSessions(stageId, chatSessions);
    log.info(`Saved ${chatSessions.length} chat sessions`);
  }

  // Save generated agents
  if (generatedAgents && generatedAgents.length > 0) {
    await saveGeneratedAgents(stageId, generatedAgents);
    log.info(`Saved ${generatedAgents.length} generated agents`);
  }

  log.info(`Successfully saved client data for stage ${stageId}`);

  return apiSuccess({
    message: 'Data saved to MySQL',
    stageId,
  });
}

export async function GET(request: NextRequest) {
  try {
    await initDatabaseTables();

    const action = request.nextUrl.searchParams.get('action');

    if (action === 'status') {
      // Check migration status
      const fileCount = await countFileClassrooms();
      const mysqlCount = await countMySQLClassrooms();

      return apiSuccess({
        fileClassrooms: fileCount,
        mysqlClassrooms: mysqlCount,
        needsMigration: fileCount > mysqlCount,
      });
    }

    return apiSuccess({
      message: 'Migration API',
      endpoints: {
        'POST /api/migrate': 'Start file migration or send client data',
        'GET /api/migrate?action=status': 'Check migration status',
      },
    });
  } catch (error) {
    log.error('Status check failed:', error);
    return apiError(
      API_ERROR_CODES.INTERNAL_ERROR,
      500,
      'Status check failed',
      error instanceof Error ? error.message : String(error),
    );
  }
}

async function countFileClassrooms(): Promise<number> {
  try {
    const files = await fs.readdir(CLASSROOMS_DIR);
    return files.filter((f) => f.endsWith('.json')).length;
  } catch {
    return 0;
  }
}

async function countMySQLClassrooms(): Promise<number> {
  // This is a simple count - we just check maic_classroom table
  // For a full count, we'd need to query all tables
  try {
    const { getMysqlPool } = await import('@/lib/server/mysql');
    const connection = await getMysqlPool().getConnection();
    try {
      const [rows] = await connection.execute('SELECT COUNT(*) as count FROM maic_classroom') as Array<Array<{ count: number }>>;
      return rows[0]?.count || 0;
    } finally {
      connection.release();
    }
  } catch {
    return 0;
  }
}

async function migrateFileClassroomsToMySQL(): Promise<number> {
  let migratedCount = 0;

  try {
    // Ensure classrooms directory exists
    await fs.access(CLASSROOMS_DIR);
  } catch {
    log.info('No classrooms directory found, skipping file migration');
    return 0;
  }

  const files = await fs.readdir(CLASSROOMS_DIR);
  const jsonFiles = files.filter((f) => f.endsWith('.json'));

  log.info(`Found ${jsonFiles.length} file-based classrooms`);

  for (const file of jsonFiles) {
    const classroomId = file.replace('.json', '');
    try {
      // Check if already in MySQL
      const existing = await getClassroomFromMysql(classroomId);
      if (existing) {
        log.info(`Classroom ${classroomId} already in MySQL, skipping`);
        continue;
      }

      // Read from file
      const classroom = await readClassroom(classroomId);
      if (!classroom) {
        log.warn(`Failed to read classroom ${classroomId}`);
        continue;
      }

      // Save to MySQL
      await saveClassroomToMysql(classroomId, classroom.stage, classroom.scenes);
      migratedCount++;
      log.info(`Migrated classroom ${classroomId} to MySQL`);
    } catch (error) {
      log.error(`Failed to migrate classroom ${classroomId}:`, error);
    }
  }

  log.info(`Migrated ${migratedCount} file-based classrooms to MySQL`);
  return migratedCount;
}
