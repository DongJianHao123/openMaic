/**
 * MySQL Database Connection
 *
 * Handles MySQL database operations for classroom storage
 */

import mysql from 'mysql2/promise';
import { createLogger } from '@/lib/logger';

const log = createLogger('MySQL');

// Database configuration from environment or default
const DB_URL = process.env.MYSQL_URL || 'mysql://root:wEkqGeWnsSrht0h@101.42.24.220:3306/openmaic';

let pool: mysql.Pool | null = null;

/**
 * Get or create MySQL connection pool
 */
export function getMysqlPool(): mysql.Pool {
  if (!pool) {
    pool = mysql.createPool(DB_URL);
    log.info('MySQL connection pool created');
  }
  return pool;
}

/**
 * Close MySQL connection pool
 */
export async function closeMysqlPool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
    log.info('MySQL connection pool closed');
  }
}

/**
 * Initialize all database tables if they don't exist
 */
export async function initDatabaseTables(): Promise<void> {
  const connection = await getMysqlPool().getConnection();
  try {
    // maic_classroom table (legacy)
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS maic_classroom (
        id VARCHAR(255) PRIMARY KEY COMMENT 'Classroom ID',
        stage JSON NOT NULL COMMENT 'Stage data (JSON)',
        scenes JSON NOT NULL COMMENT 'Scenes data (JSON array)',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT 'Creation time',
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT 'Last update time',
        INDEX idx_created_at (created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='MAIC Classroom Storage (Legacy)'
    `);
    log.info('maic_classroom table initialized');

    // stages table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS maic_stages (
        id VARCHAR(255) PRIMARY KEY COMMENT 'Stage ID',
        name VARCHAR(500) NOT NULL COMMENT 'Stage name',
        description TEXT COMMENT 'Stage description',
        created_at BIGINT NOT NULL COMMENT 'Creation timestamp',
        updated_at BIGINT NOT NULL COMMENT 'Update timestamp',
        language VARCHAR(50) COMMENT 'Language code',
        style VARCHAR(50) COMMENT 'Stage style',
        current_scene_id VARCHAR(255) COMMENT 'Current scene ID',
        agent_ids JSON COMMENT 'Agent IDs (JSON array)',
        generated_agent_configs JSON COMMENT 'Generated agent configs (JSON)',
        INDEX idx_updated_at (updated_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='MAIC Stages'
    `);
    log.info('maic_stages table initialized');

    // scenes table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS maic_scenes (
        id VARCHAR(255) PRIMARY KEY COMMENT 'Scene ID',
        stage_id VARCHAR(255) NOT NULL COMMENT 'Stage ID',
        type VARCHAR(50) NOT NULL COMMENT 'Scene type',
        title VARCHAR(500) NOT NULL COMMENT 'Scene title',
        \`order\` INT NOT NULL COMMENT 'Display order',
        content JSON COMMENT 'Scene content (JSON)',
        actions JSON COMMENT 'Actions (JSON array)',
        whiteboard JSON COMMENT 'Whiteboard data (JSON array)',
        created_at BIGINT NOT NULL COMMENT 'Creation timestamp',
        updated_at BIGINT NOT NULL COMMENT 'Update timestamp',
        INDEX idx_stage_id (stage_id),
        INDEX idx_stage_order (stage_id, \`order\`),
        FOREIGN KEY (stage_id) REFERENCES maic_stages(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='MAIC Scenes'
    `);
    log.info('maic_scenes table initialized');

    // audio_files table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS maic_audio_files (
        id VARCHAR(255) PRIMARY KEY COMMENT 'Audio ID',
        \`blob\` LONGBLOB NOT NULL COMMENT 'Audio binary data',
        duration DOUBLE COMMENT 'Duration in seconds',
        format VARCHAR(50) NOT NULL COMMENT 'Audio format (mp3, wav, etc.)',
        text TEXT COMMENT 'Corresponding text content',
        voice VARCHAR(255) COMMENT 'Voice used',
        created_at BIGINT NOT NULL COMMENT 'Creation timestamp',
        oss_key TEXT COMMENT 'Full CDN URL for this audio blob',
        INDEX idx_created_at (created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='MAIC Audio Files'
    `);
    log.info('maic_audio_files table initialized');

    // image_files table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS maic_image_files (
        id VARCHAR(255) PRIMARY KEY COMMENT 'Image ID',
        \`blob\` LONGBLOB NOT NULL COMMENT 'Image binary data',
        filename VARCHAR(500) NOT NULL COMMENT 'Original filename',
        mime_type VARCHAR(100) NOT NULL COMMENT 'MIME type',
        size BIGINT NOT NULL COMMENT 'File size in bytes',
        created_at BIGINT NOT NULL COMMENT 'Creation timestamp',
        INDEX idx_created_at (created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='MAIC Image Files'
    `);
    log.info('maic_image_files table initialized');

    // chat_sessions table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS maic_chat_sessions (
        id VARCHAR(255) PRIMARY KEY COMMENT 'Session ID',
        stage_id VARCHAR(255) NOT NULL COMMENT 'Stage ID',
        type VARCHAR(50) NOT NULL COMMENT 'Session type',
        title VARCHAR(500) NOT NULL COMMENT 'Session title',
        status VARCHAR(50) NOT NULL COMMENT 'Session status',
        messages JSON NOT NULL COMMENT 'Messages (JSON array)',
        config JSON NOT NULL COMMENT 'Session config (JSON)',
        tool_calls JSON COMMENT 'Tool calls (JSON array)',
        pending_tool_calls JSON COMMENT 'Pending tool calls (JSON array)',
        created_at BIGINT NOT NULL COMMENT 'Creation timestamp',
        updated_at BIGINT NOT NULL COMMENT 'Update timestamp',
        scene_id VARCHAR(255) COMMENT 'Scene ID',
        last_action_index INT COMMENT 'Last action index',
        INDEX idx_stage_id (stage_id),
        INDEX idx_stage_created (stage_id, created_at),
        FOREIGN KEY (stage_id) REFERENCES maic_stages(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='MAIC Chat Sessions'
    `);
    log.info('maic_chat_sessions table initialized');

    // playback_state table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS maic_playback_state (
        stage_id VARCHAR(255) PRIMARY KEY COMMENT 'Stage ID',
        scene_index INT NOT NULL COMMENT 'Scene index',
        action_index INT NOT NULL COMMENT 'Action index',
        consumed_discussions JSON NOT NULL COMMENT 'Consumed discussions (JSON array)',
        updated_at BIGINT NOT NULL COMMENT 'Update timestamp',
        FOREIGN KEY (stage_id) REFERENCES maic_stages(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='MAIC Playback State'
    `);
    log.info('maic_playback_state table initialized');

    // stage_outlines table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS maic_stage_outlines (
        stage_id VARCHAR(255) PRIMARY KEY COMMENT 'Stage ID',
        outlines JSON NOT NULL COMMENT 'Outlines (JSON array)',
        created_at BIGINT NOT NULL COMMENT 'Creation timestamp',
        updated_at BIGINT NOT NULL COMMENT 'Update timestamp',
        FOREIGN KEY (stage_id) REFERENCES maic_stages(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='MAIC Stage Outlines'
    `);
    log.info('maic_stage_outlines table initialized');

    // media_files table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS maic_media_files (
        id VARCHAR(255) PRIMARY KEY COMMENT 'Compound key: stageId:elementId',
        stage_id VARCHAR(255) NOT NULL COMMENT 'Stage ID',
        type VARCHAR(20) NOT NULL COMMENT 'Media type: image or video',
        \`blob\` LONGBLOB NOT NULL COMMENT 'Media binary',
        mime_type VARCHAR(100) NOT NULL COMMENT 'MIME type',
        size BIGINT NOT NULL COMMENT 'File size',
        \`poster\` LONGBLOB COMMENT 'Video thumbnail blob',
        prompt TEXT COMMENT 'Original prompt for retry',
        params TEXT COMMENT 'JSON-serialized generation params',
        error TEXT COMMENT 'Error message if failed',
        error_code VARCHAR(255) COMMENT 'Structured error code',
        oss_key TEXT COMMENT 'Full CDN URL for this media blob',
        poster_oss_key TEXT COMMENT 'Full CDN URL for the poster blob',
        created_at BIGINT NOT NULL COMMENT 'Creation timestamp',
        INDEX idx_stage_id (stage_id),
        INDEX idx_stage_type (stage_id, type),
        FOREIGN KEY (stage_id) REFERENCES maic_stages(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='MAIC Media Files'
    `);
    log.info('maic_media_files table initialized');

    // generated_agents table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS maic_generated_agents (
        id VARCHAR(255) PRIMARY KEY COMMENT 'Agent ID',
        stage_id VARCHAR(255) NOT NULL COMMENT 'Stage ID',
        name VARCHAR(255) NOT NULL COMMENT 'Agent name',
        role VARCHAR(50) NOT NULL COMMENT 'Role: teacher, assistant, student',
        persona TEXT NOT NULL COMMENT 'Agent persona',
        avatar VARCHAR(500) NOT NULL COMMENT 'Avatar',
        color VARCHAR(50) NOT NULL COMMENT 'Color',
        priority INT NOT NULL COMMENT 'Priority',
        created_at BIGINT NOT NULL COMMENT 'Creation timestamp',
        INDEX idx_stage_id (stage_id),
        FOREIGN KEY (stage_id) REFERENCES maic_stages(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='MAIC Generated Agents'
    `);
    log.info('maic_generated_agents table initialized');

    log.info('All database tables initialized successfully');
  } finally {
    connection.release();
  }
}

// Keep the old function for backward compatibility
export async function initMaicClassroomTable(): Promise<void> {
  await initDatabaseTables();
}

// ==================== maic_classroom operations (legacy) ====================

/**
 * Insert or update a classroom in MySQL (legacy)
 */
export async function saveClassroomToMysql(
  id: string,
  stage: unknown,
  scenes: unknown[]
): Promise<void> {
  const connection = await getMysqlPool().getConnection();
  try {
    await connection.execute(
      `INSERT INTO maic_classroom (id, stage, scenes, created_at)
       VALUES (?, ?, ?, NOW())
       ON DUPLICATE KEY UPDATE
         stage = VALUES(stage),
         scenes = VALUES(scenes),
         updated_at = NOW()`,
      [id, JSON.stringify(stage), JSON.stringify(scenes)]
    );
    log.info(`Classroom saved to MySQL: ${id}`);
  } finally {
    connection.release();
  }
}

/**
 * Safely parse JSON data that might already be an object
 */
function safeJsonParse(data: unknown): unknown {
  if (typeof data === 'string') {
    try {
      return JSON.parse(data);
    } catch {
      return data;
    }
  }
  return data;
}

/**
 * Get a classroom from MySQL by ID (legacy)
 */
export async function getClassroomFromMysql(
  id: string
): Promise<{ id: string; stage: unknown; scenes: unknown[]; createdAt: Date } | null> {
  const connection = await getMysqlPool().getConnection();
  try {
    const [rows] = await connection.execute(
      'SELECT id, stage, scenes, created_at FROM maic_classroom WHERE id = ?',
      [id]
    ) as Array<Array<{ id: string; stage: unknown; scenes: unknown; created_at: Date }>>;

    if (rows.length === 0) {
      return null;
    }

    const row = rows[0];
    return {
      id: row.id,
      stage: safeJsonParse(row.stage),
      scenes: safeJsonParse(row.scenes) as unknown[],
      createdAt: row.created_at
    };
  } finally {
    connection.release();
  }
}

/**
 * Delete a classroom from MySQL (legacy)
 */
export async function deleteClassroomFromMysql(id: string): Promise<void> {
  const connection = await getMysqlPool().getConnection();
  try {
    await connection.execute('DELETE FROM maic_classroom WHERE id = ?', [id]);
    log.info(`Classroom deleted from MySQL: ${id}`);
  } finally {
    connection.release();
  }
}

/**
 * List all classrooms from MySQL (legacy)
 */
export async function listClassroomsFromMysql(): Promise<Array<{ id: string; createdAt: Date }>> {
  const connection = await getMysqlPool().getConnection();
  try {
    const [rows] = await connection.execute(
      'SELECT id, created_at FROM maic_classroom ORDER BY created_at DESC'
    ) as Array<Array<{ id: string; created_at: Date }>>;

    return rows.map((row) => ({
      id: row.id,
      createdAt: row.created_at
    }));
  } finally {
    connection.release();
  }
}

// ==================== Stage operations ====================

export interface StageRecord {
  id: string;
  name: string;
  description?: string;
  createdAt: number;
  updatedAt: number;
  language?: string;
  style?: string;
  currentSceneId?: string;
  agentIds?: string[];
  generatedAgentConfigs?: unknown;
}

export async function saveStage(stage: StageRecord): Promise<void> {
  const connection = await getMysqlPool().getConnection();
  try {
    await connection.execute(
      `INSERT INTO maic_stages (id, name, description, created_at, updated_at, language, style, current_scene_id, agent_ids, generated_agent_configs)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         name = VALUES(name),
         description = VALUES(description),
         updated_at = VALUES(updated_at),
         language = VALUES(language),
         style = VALUES(style),
         current_scene_id = VALUES(current_scene_id),
         agent_ids = VALUES(agent_ids),
         generated_agent_configs = VALUES(generated_agent_configs)`,
      [
        stage.id,
        stage.name,
        stage.description || null,
        stage.createdAt,
        stage.updatedAt,
        stage.language || null,
        stage.style || null,
        stage.currentSceneId || null,
        stage.agentIds ? JSON.stringify(stage.agentIds) : null,
        stage.generatedAgentConfigs ? JSON.stringify(stage.generatedAgentConfigs) : null,
      ]
    );
    log.info(`Stage saved to MySQL: ${stage.id}`);
  } finally {
    connection.release();
  }
}

export async function getStage(stageId: string): Promise<StageRecord | null> {
  const connection = await getMysqlPool().getConnection();
  try {
    const [rows] = await connection.execute(
      'SELECT * FROM maic_stages WHERE id = ?',
      [stageId]
    ) as Array<Array<{
      id: string;
      name: string;
      description: string | null;
      created_at: number;
      updated_at: number;
      language: string | null;
      style: string | null;
      current_scene_id: string | null;
      agent_ids: string | null;
      generated_agent_configs: string | null;
    }>>;

    if (rows.length === 0) {
      return null;
    }

    const row = rows[0];
    return {
      id: row.id,
      name: row.name,
      description: row.description ?? undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      language: row.language ?? undefined,
      style: row.style ?? undefined,
      currentSceneId: row.current_scene_id ?? undefined,
      agentIds: row.agent_ids ? safeJsonParse(row.agent_ids) : undefined,
      generatedAgentConfigs: row.generated_agent_configs ? safeJsonParse(row.generated_agent_configs) : undefined,
    };
  } finally {
    connection.release();
  }
}

export async function deleteStage(stageId: string): Promise<void> {
  const connection = await getMysqlPool().getConnection();
  try {
    await connection.execute('DELETE FROM maic_stages WHERE id = ?', [stageId]);
    log.info(`Stage deleted from MySQL: ${stageId}`);
  } finally {
    connection.release();
  }
}

export async function listStages(): Promise<Array<{ id: string; name: string; description?: string; createdAt: number; updatedAt: number }>> {
  const connection = await getMysqlPool().getConnection();
  try {
    const [rows] = await connection.execute(
      'SELECT id, name, description, created_at, updated_at FROM maic_stages ORDER BY updated_at DESC'
    ) as Array<Array<{ id: string; name: string; description: string | null; created_at: number; updated_at: number }>>;

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description ?? undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  } finally {
    connection.release();
  }
}

// ==================== Scene operations ====================

export interface SceneRecord {
  id: string;
  stageId: string;
  type: string;
  title: string;
  order: number;
  content?: unknown;
  actions?: unknown[];
  whiteboard?: unknown[];
  createdAt: number;
  updatedAt: number;
}

export async function saveScenes(stageId: string, scenes: SceneRecord[]): Promise<void> {
  const connection = await getMysqlPool().getConnection();
  try {
    await connection.beginTransaction();

    // Delete old scenes first
    await connection.execute('DELETE FROM maic_scenes WHERE stage_id = ?', [stageId]);

    if (scenes.length > 0) {
      const placeholders = scenes.map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').join(',');
      const values: unknown[] = [];
      for (const scene of scenes) {
        values.push(
          scene.id,
          stageId,
          scene.type,
          scene.title,
          scene.order,
          scene.content ? JSON.stringify(scene.content) : null,
          scene.actions ? JSON.stringify(scene.actions) : null,
          scene.whiteboard ? JSON.stringify(scene.whiteboard) : null,
          scene.createdAt,
          scene.updatedAt
        );
      }
      await connection.execute(
        `INSERT INTO maic_scenes (id, stage_id, type, title, \`order\`, content, actions, whiteboard, created_at, updated_at)
         VALUES ${placeholders}`,
        values
      );
    }

    await connection.commit();
    log.info(`Saved ${scenes.length} scenes for stage: ${stageId}`);
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
}

export async function getScenes(stageId: string): Promise<SceneRecord[]> {
  const connection = await getMysqlPool().getConnection();
  try {
    const [rows] = await connection.execute(
      'SELECT * FROM maic_scenes WHERE stage_id = ? ORDER BY \`order\`',
      [stageId]
    ) as Array<Array<{
      id: string;
      stage_id: string;
      type: string;
      title: string;
      order: number;
      content: unknown;
      actions: unknown;
      whiteboard: unknown;
      created_at: number;
      updated_at: number;
    }>>;

    return rows.map((row) => ({
      id: row.id,
      stageId: row.stage_id,
      type: row.type,
      title: row.title,
      order: row.order,
      content: row.content ? safeJsonParse(row.content) : undefined,
      actions: row.actions ? safeJsonParse(row.actions) : undefined,
      whiteboard: row.whiteboard ? safeJsonParse(row.whiteboard) : undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  } finally {
    connection.release();
  }
}

// ==================== Audio File operations ====================

export interface AudioFileRecord {
  id: string;
  blob: Buffer;
  duration?: number;
  format: string;
  text?: string;
  voice?: string;
  createdAt: number;
  ossKey?: string;
}

export async function saveAudioFile(record: AudioFileRecord): Promise<void> {
  const connection = await getMysqlPool().getConnection();
  try {
    await connection.execute(
      `INSERT INTO maic_audio_files (id, blob, duration, format, text, voice, created_at, oss_key)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         blob = VALUES(blob),
         duration = VALUES(duration),
         format = VALUES(format),
         text = VALUES(text),
         voice = VALUES(voice),
         oss_key = VALUES(oss_key)`,
      [
        record.id,
        record.blob,
        record.duration ?? null,
        record.format,
        record.text ?? null,
        record.voice ?? null,
        record.createdAt,
        record.ossKey ?? null,
      ]
    );
    log.info(`Audio file saved: ${record.id}`);
  } finally {
    connection.release();
  }
}

export async function getAudioFile(id: string): Promise<AudioFileRecord | null> {
  const connection = await getMysqlPool().getConnection();
  try {
    const [rows] = await connection.execute(
      'SELECT * FROM maic_audio_files WHERE id = ?',
      [id]
    ) as Array<Array<{
      id: string;
      blob: Buffer;
      duration: number | null;
      format: string;
      text: string | null;
      voice: string | null;
      created_at: number;
      oss_key: string | null;
    }>>;

    if (rows.length === 0) {
      return null;
    }

    const row = rows[0];
    return {
      id: row.id,
      blob: row.blob,
      duration: row.duration ?? undefined,
      format: row.format,
      text: row.text ?? undefined,
      voice: row.voice ?? undefined,
      createdAt: row.created_at,
      ossKey: row.oss_key ?? undefined,
    };
  } finally {
    connection.release();
  }
}

/**
 * Get all audio files for a classroom by checking speech actions in scenes
 */
export async function getAudioFilesForClassroom(classroomId: string): Promise<AudioFileRecord[]> {
  const connection = await getMysqlPool().getConnection();
  try {
    let audioIds: Set<string> = new Set();

    try {
      // First try to get scenes from maic_scenes table
      const scenes = await getScenes(classroomId);
      if (scenes && scenes.length > 0) {
        // Extract audioIds from speech actions
        for (const scene of scenes) {
          try {
            const actions = scene.actions;
            if (Array.isArray(actions)) {
              for (const action of actions) {
                if (action && typeof action === 'object' && 'type' in action && action.type === 'speech' && 'audioId' in action && action.audioId) {
                  audioIds.add(String(action.audioId));
                }
              }
            }
          } catch (e) {
            // Skip this scene if there's an error
            continue;
          }
        }
      }
    } catch (e) {
      // If that fails, try legacy table
      try {
        const [classroomRows] = await connection.execute(
          'SELECT scenes FROM maic_classroom WHERE id = ?',
          [classroomId]
        ) as Array<Array<{ scenes: string }>>;

        if (classroomRows.length > 0) {
          // Parse scenes from legacy table
          let scenesData;
          try {
            if (typeof classroomRows[0].scenes === 'string') {
              scenesData = JSON.parse(classroomRows[0].scenes);
            } else {
              scenesData = classroomRows[0].scenes;
            }
          } catch {
            scenesData = classroomRows[0].scenes;
          }

          if (Array.isArray(scenesData)) {
            // Extract audioIds from speech actions
            for (const scene of scenesData) {
              try {
                const actions = scene && typeof scene === 'object' ? (scene as any).actions : undefined;
                if (Array.isArray(actions)) {
                  for (const action of actions) {
                    if (action && typeof action === 'object' && action.type === 'speech' && action.audioId) {
                      audioIds.add(String(action.audioId));
                    }
                  }
                }
              } catch (e) {
                continue;
              }
            }
          }
        }
      } catch (legacyErr) {
        // Ignore errors from legacy table
      }
    }

    if (audioIds.size === 0) return [];

    // Get all audio files
    const [audioRows] = await connection.execute(
      `SELECT * FROM maic_audio_files WHERE id IN (${Array.from(audioIds).map(() => '?').join(',')})`,
      Array.from(audioIds)
    ) as Array<Array<any>>;

    return audioRows.map(row => ({
      id: row.id,
      blob: row.blob,
      duration: row.duration ?? undefined,
      format: row.format,
      text: row.text ?? undefined,
      voice: row.voice ?? undefined,
      createdAt: row.created_at,
      ossKey: row.oss_key ?? undefined,
    }));
  } catch (err) {
    log.error('Error in getAudioFilesForClassroom:', err);
    return [];
  } finally {
    connection.release();
  }
}

// ==================== Media File operations ====================

export interface MediaFileRecord {
  id: string;
  stageId: string;
  type: 'image' | 'video';
  blob: Buffer;
  mimeType: string;
  size: number;
  poster?: Buffer;
  prompt?: string;
  params?: string;
  error?: string;
  errorCode?: string;
  ossKey?: string;
  posterOssKey?: string;
  createdAt: number;
}

export async function saveMediaFile(record: MediaFileRecord): Promise<void> {
  const connection = await getMysqlPool().getConnection();
  try {
    await connection.execute(
      `INSERT INTO maic_media_files (id, stage_id, type, blob, mime_type, size, poster, prompt, params, error, error_code, oss_key, poster_oss_key, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         blob = VALUES(blob),
         mime_type = VALUES(mime_type),
         size = VALUES(size),
         poster = VALUES(poster),
         prompt = VALUES(prompt),
         params = VALUES(params),
         error = VALUES(error),
         error_code = VALUES(error_code),
         oss_key = VALUES(oss_key),
         poster_oss_key = VALUES(poster_oss_key)`,
      [
        record.id,
        record.stageId,
        record.type,
        record.blob,
        record.mimeType,
        record.size,
        record.poster ?? null,
        record.prompt ?? null,
        record.params ?? null,
        record.error ?? null,
        record.errorCode ?? null,
        record.ossKey ?? null,
        record.posterOssKey ?? null,
        record.createdAt,
      ]
    );
    log.info(`Media file saved: ${record.id}`);
  } finally {
    connection.release();
  }
}

export async function getMediaFile(id: string): Promise<MediaFileRecord | null> {
  const connection = await getMysqlPool().getConnection();
  try {
    const [rows] = await connection.execute(
      'SELECT * FROM maic_media_files WHERE id = ?',
      [id]
    ) as Array<Array<{
      id: string;
      stage_id: string;
      type: 'image' | 'video';
      blob: Buffer;
      mime_type: string;
      size: number;
      poster: Buffer | null;
      prompt: string | null;
      params: string | null;
      error: string | null;
      error_code: string | null;
      oss_key: string | null;
      poster_oss_key: string | null;
      created_at: number;
    }>>;

    if (rows.length === 0) {
      return null;
    }

    const row = rows[0];
    return {
      id: row.id,
      stageId: row.stage_id,
      type: row.type,
      blob: row.blob,
      mimeType: row.mime_type,
      size: row.size,
      poster: row.poster ?? undefined,
      prompt: row.prompt ?? undefined,
      params: row.params ?? undefined,
      error: row.error ?? undefined,
      errorCode: row.error_code ?? undefined,
      ossKey: row.oss_key ?? undefined,
      posterOssKey: row.poster_oss_key ?? undefined,
      createdAt: row.created_at,
    };
  } finally {
    connection.release();
  }
}

export async function getMediaFilesByStage(stageId: string): Promise<MediaFileRecord[]> {
  const connection = await getMysqlPool().getConnection();
  try {
    const [rows] = await connection.execute(
      'SELECT * FROM maic_media_files WHERE stage_id = ?',
      [stageId]
    ) as Array<Array<{
      id: string;
      stage_id: string;
      type: 'image' | 'video';
      blob: Buffer;
      mime_type: string;
      size: number;
      poster: Buffer | null;
      prompt: string | null;
      params: string | null;
      error: string | null;
      error_code: string | null;
      oss_key: string | null;
      poster_oss_key: string | null;
      created_at: number;
    }>>;

    return rows.map((row) => ({
      id: row.id,
      stageId: row.stage_id,
      type: row.type,
      blob: row.blob,
      mimeType: row.mime_type,
      size: row.size,
      poster: row.poster ?? undefined,
      prompt: row.prompt ?? undefined,
      params: row.params ?? undefined,
      error: row.error ?? undefined,
      errorCode: row.error_code ?? undefined,
      ossKey: row.oss_key ?? undefined,
      posterOssKey: row.poster_oss_key ?? undefined,
      createdAt: row.created_at,
    }));
  } finally {
    connection.release();
  }
}

// ==================== Chat Session operations ====================

export interface ChatSessionRecord {
  id: string;
  stageId: string;
  type: string;
  title: string;
  status: string;
  messages: unknown[];
  config: unknown;
  toolCalls?: unknown[];
  pendingToolCalls?: unknown[];
  createdAt: number;
  updatedAt: number;
  sceneId?: string;
  lastActionIndex?: number;
}

export async function saveChatSessions(stageId: string, sessions: ChatSessionRecord[]): Promise<void> {
  const connection = await getMysqlPool().getConnection();
  try {
    await connection.beginTransaction();

    await connection.execute('DELETE FROM maic_chat_sessions WHERE stage_id = ?', [stageId]);

    if (sessions.length > 0) {
      const placeholders = sessions.map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').join(',');
      const values: unknown[] = [];
      for (const session of sessions) {
        values.push(
          session.id,
          stageId,
          session.type,
          session.title,
          session.status,
          JSON.stringify(session.messages),
          JSON.stringify(session.config),
          session.toolCalls ? JSON.stringify(session.toolCalls) : null,
          session.pendingToolCalls ? JSON.stringify(session.pendingToolCalls) : null,
          session.createdAt,
          session.updatedAt,
          session.sceneId ?? null,
          session.lastActionIndex ?? null
        );
      }
      await connection.execute(
        `INSERT INTO maic_chat_sessions (id, stage_id, type, title, status, messages, config, tool_calls, pending_tool_calls, created_at, updated_at, scene_id, last_action_index)
         VALUES ${placeholders}`,
        values
      );
    }

    await connection.commit();
    log.info(`Saved ${sessions.length} chat sessions for stage: ${stageId}`);
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
}

export async function getChatSessions(stageId: string): Promise<ChatSessionRecord[]> {
  const connection = await getMysqlPool().getConnection();
  try {
    const [rows] = await connection.execute(
      'SELECT * FROM maic_chat_sessions WHERE stage_id = ? ORDER BY created_at',
      [stageId]
    ) as Array<Array<{
      id: string;
      stage_id: string;
      type: string;
      title: string;
      status: string;
      messages: string;
      config: string;
      tool_calls: string | null;
      pending_tool_calls: string | null;
      created_at: number;
      updated_at: number;
      scene_id: string | null;
      last_action_index: number | null;
    }>>;

    return rows.map((row) => ({
      id: row.id,
      stageId: row.stage_id,
      type: row.type,
      title: row.title,
      status: row.status,
      messages: safeJsonParse(row.messages),
      config: safeJsonParse(row.config),
      toolCalls: row.tool_calls ? safeJsonParse(row.tool_calls) : undefined,
      pendingToolCalls: row.pending_tool_calls ? safeJsonParse(row.pending_tool_calls) : undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      sceneId: row.scene_id ?? undefined,
      lastActionIndex: row.last_action_index ?? undefined,
    }));
  } finally {
    connection.release();
  }
}

// ==================== Generated Agent operations ====================

export interface GeneratedAgentRecord {
  id: string;
  stageId: string;
  name: string;
  role: string;
  persona: string;
  avatar: string;
  color: string;
  priority: number;
  createdAt: number;
}

export async function saveGeneratedAgents(stageId: string, agents: GeneratedAgentRecord[]): Promise<void> {
  const connection = await getMysqlPool().getConnection();
  try {
    await connection.beginTransaction();

    await connection.execute('DELETE FROM maic_generated_agents WHERE stage_id = ?', [stageId]);

    if (agents.length > 0) {
      const placeholders = agents.map(() => '(?, ?, ?, ?, ?, ?, ?, ?)').join(',');
      const values: unknown[] = [];
      for (const agent of agents) {
        values.push(
          agent.id,
          stageId,
          agent.name,
          agent.role,
          agent.persona,
          agent.avatar,
          agent.color,
          agent.priority,
          agent.createdAt
        );
      }
      await connection.execute(
        `INSERT INTO maic_generated_agents (id, stage_id, name, role, persona, avatar, color, priority, created_at)
         VALUES ${placeholders}`,
        values
      );
    }

    await connection.commit();
    log.info(`Saved ${agents.length} generated agents for stage: ${stageId}`);
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
}

export async function getGeneratedAgents(stageId: string): Promise<GeneratedAgentRecord[]> {
  const connection = await getMysqlPool().getConnection();
  try {
    const [rows] = await connection.execute(
      'SELECT * FROM maic_generated_agents WHERE stage_id = ?',
      [stageId]
    ) as Array<Array<{
      id: string;
      stage_id: string;
      name: string;
      role: string;
      persona: string;
      avatar: string;
      color: string;
      priority: number;
      created_at: number;
    }>>;

    return rows.map((row) => ({
      id: row.id,
      stageId: row.stage_id,
      name: row.name,
      role: row.role,
      persona: row.persona,
      avatar: row.avatar,
      color: row.color,
      priority: row.priority,
      createdAt: row.created_at,
    }));
  } finally {
    connection.release();
  }
}

// ==================== Playback State operations ====================

export interface PlaybackStateRecord {
  stageId: string;
  sceneIndex: number;
  actionIndex: number;
  consumedDiscussions: unknown[];
  updatedAt: number;
}

export async function savePlaybackState(state: PlaybackStateRecord): Promise<void> {
  const connection = await getMysqlPool().getConnection();
  try {
    await connection.execute(
      `INSERT INTO maic_playback_state (stage_id, scene_index, action_index, consumed_discussions, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         scene_index = VALUES(scene_index),
         action_index = VALUES(action_index),
         consumed_discussions = VALUES(consumed_discussions),
         updated_at = VALUES(updated_at)`,
      [
        state.stageId,
        state.sceneIndex,
        state.actionIndex,
        JSON.stringify(state.consumedDiscussions),
        state.updatedAt,
      ]
    );
    log.info(`Playback state saved: ${state.stageId}`);
  } finally {
    connection.release();
  }
}

export async function getPlaybackState(stageId: string): Promise<PlaybackStateRecord | null> {
  const connection = await getMysqlPool().getConnection();
  try {
    const [rows] = await connection.execute(
      'SELECT * FROM maic_playback_state WHERE stage_id = ?',
      [stageId]
    ) as Array<Array<{
      stage_id: string;
      scene_index: number;
      action_index: number;
      consumed_discussions: string;
      updated_at: number;
    }>>;

    if (rows.length === 0) {
      return null;
    }

    const row = rows[0];
    return {
      stageId: row.stage_id,
      sceneIndex: row.scene_index,
      actionIndex: row.action_index,
      consumedDiscussions: safeJsonParse(row.consumed_discussions) as unknown[],
      updatedAt: row.updated_at,
    };
  } finally {
    connection.release();
  }
}

// ==================== Stage Outlines operations ====================

export interface StageOutlinesRecord {
  stageId: string;
  outlines: unknown[];
  createdAt: number;
  updatedAt: number;
}

export async function saveStageOutlines(outlines: StageOutlinesRecord): Promise<void> {
  const connection = await getMysqlPool().getConnection();
  try {
    await connection.execute(
      `INSERT INTO maic_stage_outlines (stage_id, outlines, created_at, updated_at)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         outlines = VALUES(outlines),
         updated_at = VALUES(updated_at)`,
      [
        outlines.stageId,
        JSON.stringify(outlines.outlines),
        outlines.createdAt,
        outlines.updatedAt,
      ]
    );
    log.info(`Stage outlines saved: ${outlines.stageId}`);
  } finally {
    connection.release();
  }
}

export async function getStageOutlines(stageId: string): Promise<StageOutlinesRecord | null> {
  const connection = await getMysqlPool().getConnection();
  try {
    const [rows] = await connection.execute(
      'SELECT * FROM maic_stage_outlines WHERE stage_id = ?',
      [stageId]
    ) as Array<Array<{
      stage_id: string;
      outlines: string;
      created_at: number;
      updated_at: number;
    }>>;

    if (rows.length === 0) {
      return null;
    }

    const row = rows[0];
    return {
      stageId: row.stage_id,
      outlines: safeJsonParse(row.outlines) as unknown[],
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  } finally {
    connection.release();
  }
}
