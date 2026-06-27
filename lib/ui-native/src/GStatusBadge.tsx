import React from 'react';
import { GBadge } from './GBadge';

type SystemStatus = 'معتمد' | 'مرفوض' | 'قيد المراجعة' | 'مسودة' | 'مغلق' | 'نشط' | 'غير نشط' | 'مكتمل' | 'ملغى' | string;

interface GStatusBadgeProps {
  status: SystemStatus;
  size?: 'sm' | 'md';
}

function statusToTone(status: string): 'default' | 'success' | 'warning' | 'danger' | 'info' {
  switch (status) {
    case 'معتمد': case 'نشط': case 'مكتمل': return 'success';
    case 'مرفوض': case 'ملغى': return 'danger';
    case 'قيد المراجعة': return 'warning';
    case 'مسودة': case 'مغلق': case 'غير نشط': return 'default';
    default: return 'info';
  }
}

export function GStatusBadge({ status, size = 'md' }: GStatusBadgeProps) {
  return <GBadge label={status} tone={statusToTone(status)} size={size} />;
}
