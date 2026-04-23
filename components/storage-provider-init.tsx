'use client';

import { useEffect, useState } from 'react';
import { initStorageProvider } from '@/lib/storage';
import { createLogger } from '@/lib/logger';
import { Button } from '@/components/ui/button';
import { Database, Upload, CheckCircle, AlertCircle } from 'lucide-react';
import { db } from '@/lib/utils/database';
import { loadStageData } from '@/lib/utils/stage-storage';
import type { StageRecord, SceneRecord } from '@/lib/server/mysql';

const log = createLogger('StorageProviderInit');

type SyncStatus = 'idle' | 'syncing' | 'success' | 'error';

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
 * Initializes the storage provider on client mount.
 * Also provides MySQL sync UI for manual data migration.
 */
export function StorageProviderInit() {
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle');
  const [syncMessage, setSyncMessage] = useState('');
  const [showSyncUI, setShowSyncUI] = useState(false);
  const [stages, setStages] = useState<Array<{ id: string; name: string }>>([]);
  const [selectedStageId, setSelectedStageId] = useState<string | null>(null);

  useEffect(() => {
    try {
      initStorageProvider();
      log.info('Storage provider initialized');
    } catch (error) {
      log.error('Failed to initialize storage provider:', error);
    }

    // Check if MySQL sync is available by pinging the API
    fetch('/api/migrate?action=status')
      .then((res) => {
        if (res.ok) {
          setShowSyncUI(true);
          // Load available stages
          loadStages();
        }
      })
      .catch(() => setShowSyncUI(false));
  }, []);

  const loadStages = async () => {
    try {
      const stageList = await db.stages.orderBy('updatedAt').reverse().toArray();
      setStages(stageList.map((s) => ({ id: s.id, name: s.name })));
    } catch (err) {
      log.error('Failed to load stages:', err);
    }
  };

  const handleSyncAll = async () => {
    try {
      setSyncStatus('syncing');
      setSyncMessage('Syncing all stages to MySQL...');

      const response = await fetch('/api/migrate', {
        method: 'POST',
      });

      const result = await response.json();

      if (result.success) {
        setSyncStatus('success');
        setSyncMessage(result.data?.message || 'Sync completed!');
        log.info('Sync completed via API');
      } else {
        setSyncStatus('error');
        setSyncMessage(result.error || 'Sync failed');
      }
    } catch (error) {
      setSyncStatus('error');
      setSyncMessage(error instanceof Error ? error.message : 'Sync failed');
      log.error('Sync failed:', error);
    }

    // Reset after 3 seconds
    setTimeout(() => {
      setSyncStatus('idle');
      setSyncMessage('');
    }, 3000);
  };

  const handleSyncStage = async (stageId: string) => {
    try {
      setSyncStatus('syncing');
      setSyncMessage(`Syncing stage ${stageId}...`);
      setSelectedStageId(stageId);

      // Load stage data from IndexedDB
      const stageData = await loadStageData(stageId);
      if (!stageData) {
        throw new Error('Stage not found');
      }

      // Convert stage to MySQL format
      const now = Date.now();
      const mysqlStage: StageRecord = {
        id: stageData.stage.id,
        name: stageData.stage.name || 'Untitled Stage',
        description: stageData.stage.description,
        createdAt: stageData.stage.createdAt || now,
        updatedAt: stageData.stage.updatedAt || now,
        language: stageData.stage.language,
        style: stageData.stage.style,
        currentSceneId: stageData.currentSceneId ?? undefined,
        agentIds: stageData.stage.agentIds,
        generatedAgentConfigs: (stageData.stage as { generatedAgentConfigs?: unknown }).generatedAgentConfigs,
      };

      // Convert scenes to MySQL format
      const mysqlScenes: SceneRecord[] = stageData.scenes.map((scene, index) => ({
        id: scene.id,
        stageId: stageId,
        type: scene.type,
        title: scene.title,
        order: scene.order ?? index,
        content: scene.content,
        actions: scene.actions,
        whiteboard: scene.whiteboard,
        createdAt: scene.createdAt || now,
        updatedAt: scene.updatedAt || now,
      }));

      // Collect audio files
      const audioIds = new Set<string>();
      for (const scene of stageData.scenes) {
        if (scene.actions) {
          for (const action of scene.actions) {
            if ('audioId' in action && action.audioId) {
              audioIds.add(action.audioId);
            }
          }
        }
      }

      const audioRecords = audioIds.size > 0
        ? await db.audioFiles.where('id').anyOf([...audioIds]).toArray()
        : [];

      const audioFiles = await Promise.all(
        audioRecords.map(async (audio) => ({
          id: audio.id,
          base64: await blobToBase64(audio.blob),
          format: audio.format,
          duration: audio.duration,
          text: audio.text,
          voice: audio.voice,
        }))
      );

      // Collect media files
      const mediaRecords = await db.mediaFiles.where('stageId').equals(stageId).toArray();
      const mediaFiles = await Promise.all(
        mediaRecords.map(async (media) => ({
          id: media.id,
          stageId: media.stageId,
          type: media.type,
          base64: await blobToBase64(media.blob),
          mimeType: media.mimeType,
          size: media.size,
        }))
      );

      // Collect generated agents
      const agentRecords = await db.generatedAgents.where('stageId').equals(stageId).toArray();
      const generatedAgents = agentRecords.map((agent) => ({
        id: agent.id,
        stageId: agent.stageId,
        name: agent.name,
        role: agent.role,
        persona: agent.persona,
        avatar: agent.avatar,
        color: agent.color,
        priority: agent.priority,
        createdAt: agent.createdAt,
      }));

      // Send to API
      const response = await fetch('/api/migrate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stage: mysqlStage,
          scenes: mysqlScenes,
          audioFiles: audioFiles.length > 0 ? audioFiles : undefined,
          mediaFiles: mediaFiles.length > 0 ? mediaFiles : undefined,
          chatSessions: stageData.chats.length > 0 ? stageData.chats : undefined,
          generatedAgents: generatedAgents.length > 0 ? generatedAgents : undefined,
        }),
      });

      const result = await response.json();

      if (result.success) {
        setSyncStatus('success');
        setSyncMessage(`Stage "${stageData.stage.name}" synced!`);
        log.info('Stage synced via API');
      } else {
        setSyncStatus('error');
        setSyncMessage(result.error || 'Sync failed');
      }
    } catch (error) {
      setSyncStatus('error');
      setSyncMessage(error instanceof Error ? error.message : 'Sync failed');
      log.error('Sync failed:', error);
    }

    // Reset after 3 seconds
    setTimeout(() => {
      setSyncStatus('idle');
      setSyncMessage('');
      setSelectedStageId(null);
    }, 3000);
  };

  // Don't show anything by default
  return null;

  // Uncomment below to show migration UI
  /*
  if (!showSyncUI) {
    return null;
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
      {stages.length > 0 && (
        <div className="bg-background/95 backdrop-blur-sm border rounded-lg p-3 shadow-lg max-h-64 overflow-auto">
          <div className="text-xs text-muted-foreground mb-2 font-medium">
            Select stage to sync:
          </div>
          <div className="space-y-1">
            {stages.map((stage) => (
              <button
                key={stage.id}
                onClick={() => handleSyncStage(stage.id)}
                disabled={syncStatus === 'syncing'}
                className={`w-full text-left text-xs px-2 py-1 rounded hover:bg-accent transition-colors truncate
                  ${selectedStageId === stage.id ? 'bg-accent' : ''}`}
              >
                {stage.name}
              </button>
            ))}
          </div>
        </div>
      )}

      <Button
        size="sm"
        variant="secondary"
        onClick={handleSyncAll}
        disabled={syncStatus === 'syncing'}
        className="flex items-center gap-2 shadow-lg"
      >
        {syncStatus === 'syncing' ? (
          <>
            <Database className="w-4 h-4 animate-spin" />
            <span>Syncing...</span>
          </>
        ) : syncStatus === 'success' ? (
          <>
            <CheckCircle className="w-4 h-4 text-green-500" />
            <span>Synced!</span>
          </>
        ) : syncStatus === 'error' ? (
          <>
            <AlertCircle className="w-4 h-4 text-red-500" />
            <span>Error</span>
          </>
        ) : (
          <>
            <Upload className="w-4 h-4" />
            <span>Migrate Files</span>
          </>
        )}
      </Button>

      {syncMessage && (
        <div className="text-xs text-muted-foreground bg-background/90 px-2 py-1 rounded text-center">
          {syncMessage}
        </div>
      )}
    </div>
  );
  */
}
