/**
 * SiteDataContext — يجلب محتوى موقع وفد من نواة غيث مرة واحدة عند الإقلاع.
 * المصدر: GET /api/public/site/wafd (config + packages + services + hotels).
 * لا backend مكرر — المحتوى يُحرَّر بالكامل من لوحة تحكم غيث (الموقع الإلكتروني).
 * عند تعذّر الجلب نُبقي الصفحات تعمل عبر القيم الاحتياطية المضمّنة فيها (تدهور لطيف).
 */
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export interface SiteConfig {
  companyId: number;
  enabled: boolean;
  template: string;
  slug: string;
  customDomain: string | null;
  brandName: string | null;
  tagline: string | null;
  logoUrl: string | null;
  primaryColor: string | null;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  address: string | null;
  socials: Record<string, string>;
  heroTitle: string | null;
  heroSubtitle: string | null;
  heroImageUrl: string | null;
  aboutTitle: string | null;
  aboutBody: string | null;
  metaTitle: string | null;
  metaDescription: string | null;
}

export interface SitePackage {
  id: number;
  slug: string;
  name: string;
  subtitle: string | null;
  price: string | null;
  currency: string | null;
  durationLabel: string | null;
  durationDays: number | null;
  badge: string | null;
  features: string[];
  notIncluded: string[];
  imageUrl: string | null;
  sortOrder: number;
  isActive: boolean;
}

export interface SiteService {
  id: number;
  slug: string;
  title: string;
  subtitle: string | null;
  description: string | null;
  icon: string | null;
  link: string | null;
  features: string[];
  sortOrder: number;
  isActive: boolean;
}

export interface SiteHotel {
  id: number;
  slug: string;
  name: string;
  city: string | null;
  distanceLabel: string | null;
  stars: number | null;
  badge: string | null;
  imageUrl: string | null;
  description: string | null;
  sortOrder: number;
  isActive: boolean;
}

export interface SiteData {
  config: SiteConfig | null;
  packages: SitePackage[];
  services: SiteService[];
  hotels: SiteHotel[];
  loading: boolean;
  error: boolean;
}

const SITE_SLUG = "wafd";

const SiteDataContext = createContext<SiteData>({
  config: null,
  packages: [],
  services: [],
  hotels: [],
  loading: true,
  error: false,
});

export function SiteDataProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<SiteData>({
    config: null,
    packages: [],
    services: [],
    hotels: [],
    loading: true,
    error: false,
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/public/site/${SITE_SLUG}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        if (cancelled) return;
        setData({
          config: json.config ?? null,
          packages: Array.isArray(json.packages) ? json.packages : [],
          services: Array.isArray(json.services) ? json.services : [],
          hotels: Array.isArray(json.hotels) ? json.hotels : [],
          loading: false,
          error: false,
        });
      } catch {
        if (cancelled) return;
        setData((d) => ({ ...d, loading: false, error: true }));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return <SiteDataContext.Provider value={data}>{children}</SiteDataContext.Provider>;
}

export function useSiteData() {
  return useContext(SiteDataContext);
}
