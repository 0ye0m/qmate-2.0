import { useEffect, useState } from 'react';
import * as queueService from '../services/queue/queueService';
import { predictForQueue } from '../services/prediction/predictionService';
import { useQueueStore } from '../store/queueStore';

/**
 * Live view-model for one of my tokens: position, people ahead, open
 * counters, ETA ±band. Recomputed whenever the EventBus bumps the store
 * version (event-driven — no polling).
 */
export function useLiveTokenInfo(token) {
  const version = useQueueStore((s) => s.version);
  const [info, setInfo] = useState(null);

  useEffect(() => {
    let alive = true;
    if (!token) {
      setInfo(null);
      return undefined;
    }
    (async () => {
      try {
        const [queue, waiting, counters] = await Promise.all([
          queueService.getQueue(token.queueId),
          queueService.waitingTokens(token.queueId),
          queueService.countersOf(token.queueId),
        ]);
        if (!alive) return;
        if (!queue) {
          setInfo(null);
          return;
        }
        const now = Date.now();
        const ahead = waiting.filter(
          (w) => w.number < token.number && (!w.stepAwayUntil || w.stepAwayUntil < now)
        ).length;
        const open = counters.filter((c) => c.status === 'open').length;
        const eta = await predictForQueue(queue, ahead, Math.max(1, open));
        const counter = token.counterId ? counters.find((c) => c.id === token.counterId) : null;
        if (alive) {
          setInfo({
            queue,
            ahead,
            position: ahead + 1,
            open,
            eta,
            counter,
            slotsUsed: waiting.length + (await queueService.calledTokens(queue.id)).length,
          });
        }
      } catch (err) {
        console.error('[live-token]', err);
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token?.id, token?.status, token?.counterId, version]);

  return info;
}

export default useLiveTokenInfo;
