/**
 * كشف حالة الاتصال بالإنترنت
 * يستخدم أحداث window (online/offline) على الويب وفحص دوري على التطبيق الأصلي.
 */
import { useEffect, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';

function getIsOnline(): boolean {
  if (Platform.OS === 'web' && typeof navigator !== 'undefined') {
    return navigator.onLine !== false;
  }
  return true;
}

export function useOffline() {
  const [isOffline, setIsOffline] = useState(!getIsOnline());
  const prevOffline = useRef(!getIsOnline());
  const onlineCallbacks = useRef<Array<() => void>>([]);

  useEffect(() => {
    if (Platform.OS === 'web') {
      const handleOnline = () => {
        setIsOffline(false);
        if (prevOffline.current) {
          onlineCallbacks.current.forEach(cb => cb());
        }
        prevOffline.current = false;
      };
      const handleOffline = () => {
        setIsOffline(true);
        prevOffline.current = true;
      };
      window.addEventListener('online', handleOnline);
      window.addEventListener('offline', handleOffline);
      return () => {
        window.removeEventListener('online', handleOnline);
        window.removeEventListener('offline', handleOffline);
      };
    }
    // Native: poll with AppState changes
    const sub = AppState.addEventListener('change', () => {
      fetch('https://connectivity-check.net/', { method: 'HEAD', mode: 'no-cors' })
        .then(() => {
          if (prevOffline.current) {
            setIsOffline(false);
            onlineCallbacks.current.forEach(cb => cb());
            prevOffline.current = false;
          }
        })
        .catch(() => {
          if (!prevOffline.current) {
            setIsOffline(true);
            prevOffline.current = true;
          }
        });
    });
    return () => sub.remove();
  }, []);

  const onReconnect = (cb: () => void) => {
    onlineCallbacks.current.push(cb);
    return () => {
      onlineCallbacks.current = onlineCallbacks.current.filter(f => f !== cb);
    };
  };

  return { isOffline, onReconnect };
}
