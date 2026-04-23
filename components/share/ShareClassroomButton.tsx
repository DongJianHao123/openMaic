'use client';

import { useState } from 'react';
import { Share2, Copy, Check, Loader2, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { syncClassroomToServer } from '@/lib/utils/server-sync';
import { createLogger } from '@/lib/logger';
import { cn } from '@/lib/utils';

const log = createLogger('ShareClassroomButton');

interface ShareClassroomButtonProps {
  classroomId: string;
  className?: string;
  onShareStart?: () => void;
  onShareComplete?: (url: string) => void;
  onShareError?: (error: string) => void;
}

export function ShareClassroomButton({
  classroomId,
  className,
  onShareStart,
  onShareComplete,
  onShareError,
}: ShareClassroomButtonProps) {
  const [isSharing, setIsSharing] = useState(false);
  const [sharedUrl, setSharedUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const handleShare = async (e: React.MouseEvent) => {
    e.stopPropagation();

    if (sharedUrl) {
      handleCopyUrl(e);
      return;
    }

    setIsSharing(true);
    onShareStart?.();

    try {
      log.info('Starting share for classroom:', classroomId);

      const result = await syncClassroomToServer(classroomId);

      if (result.success && result.url) {
        setSharedUrl(result.url);
        toast.success('Classroom shared successfully!');
        onShareComplete?.(result.url);

        // Auto-copy the URL
        await navigator.clipboard.writeText(result.url);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } else {
        const error = result.error || 'Failed to share classroom';
        toast.error(error);
        onShareError?.(error);
      }
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Failed to share classroom';
      log.error('Share failed:', err);
      toast.error(error);
      onShareError?.(error);
    } finally {
      setIsSharing(false);
    }
  };

  const handleCopyUrl = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (sharedUrl) {
      navigator.clipboard.writeText(sharedUrl);
      setCopied(true);
      toast.success('Link copied to clipboard!');
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleOpenUrl = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (sharedUrl) {
      window.open(sharedUrl, '_blank');
    }
  };

  if (sharedUrl) {
    return (
      <div className="flex items-center gap-1">
        <Button
          size="icon"
          variant="ghost"
          className={cn(
            'size-7 bg-green-500/80 hover:bg-green-600 text-white backdrop-blur-sm rounded-full',
            className,
          )}
          onClick={handleCopyUrl}
        >
          {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className={cn(
            'size-7 bg-blue-500/80 hover:bg-blue-600 text-white backdrop-blur-sm rounded-full',
            className,
          )}
          onClick={handleOpenUrl}
        >
          <ExternalLink className="size-3.5" />
        </Button>
      </div>
    );
  }

  return (
    <Button
      size="icon"
      variant="ghost"
      className={cn(
        'size-7 opacity-0 group-hover:opacity-100 transition-opacity bg-black/30 hover:bg-blue-500/80 text-white hover:text-white backdrop-blur-sm rounded-full',
        isSharing && 'opacity-100',
        className,
      )}
      onClick={handleShare}
      disabled={isSharing}
    >
      {isSharing ? (
        <Loader2 className="size-3.5 animate-spin" />
      ) : (
        <Share2 className="size-3.5" />
      )}
    </Button>
  );
}
