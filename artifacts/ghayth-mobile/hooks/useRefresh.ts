/**
 * خطاف سحب للتحديث — يُرجع { refreshing, onRefresh } متوافقَين مع RefreshControl.
 */
import { useCallback, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

/**
 * @param queryKeys — مفاتيح TanStack Query لإلغاء صلاحيتها عند التحديث.
 *   اتركها فارغة لإلغاء صلاحية كل الكاش.
 */
export function useRefresh(queryKeys: string[][] = []) {
  const qc = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      if (queryKeys.length === 0) {
        await qc.invalidateQueries();
      } else {
        await Promise.all(queryKeys.map(key => qc.invalidateQueries({ queryKey: key })));
      }
    } finally {
      setRefreshing(false);
    }
  }, [qc, queryKeys]);

  return { refreshing, onRefresh };
}
