import React from 'react';
import { GBadge } from './GBadge';

type SystemStatus = 'معتمد' | 'مرفوض' | 'قيد المراجعة' | 'مسودة' | 'مغلق' | 'نشط' | 'غير نشط' | 'مكتمل' | 'ملغى' | string;

interface GStatusBadgeProps {
  status: SystemStatus;
  size?: 'sm' | 'md';
}

function statusToTone(status: string): 'default' | 'success' | 'warning' | 'danger' | 'info' {
  switch (status) {
    // success — green
    case 'معتمد': case 'نشط': case 'مكتمل': case 'حاضر':
    case 'مدفوع': case 'ناجحة': case 'متاح': case 'مرحّل':
    case 'تم الحل':
      return 'success';
    // danger — red
    case 'مرفوض': case 'ملغى': case 'ملغي': case 'غائب':
    case 'منتهٍ': case 'خاسرة': case 'معكوس': case 'موقوف':
      return 'danger';
    // warning — orange/yellow
    case 'قيد المراجعة': case 'معلّق': case 'متأخر':
    case 'مدفوع جزئيًا': case 'مجدول': case 'صيانة': case 'مشغول':
    case 'غير مدفوع':
      return 'warning';
    // default — gray
    case 'مسودة': case 'مغلق': case 'غير نشط':
    case 'إجازة رسمية':
      return 'default';
    // info — blue
    case 'قيد التنفيذ': case 'جديد': case 'مفتوح':
    case 'إجازة': case 'مستأذن':
      return 'info';
    default: return 'info';
  }
}

export function GStatusBadge({ status, size = 'md' }: GStatusBadgeProps) {
  return <GBadge label={status} tone={statusToTone(status)} size={size} />;
}
