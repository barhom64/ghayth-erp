import { lazy } from "react";

const SiteSettings = lazy(() => import("@/pages/website/settings"));
const SitePackages = lazy(() => import("@/pages/website/packages"));
const SitePackageForm = lazy(() => import("@/pages/website/package-form"));
const SiteServices = lazy(() => import("@/pages/website/services"));
const SiteServiceForm = lazy(() => import("@/pages/website/service-form"));
const SiteHotels = lazy(() => import("@/pages/website/hotels"));
const SiteHotelForm = lazy(() => import("@/pages/website/hotel-form"));
const SitePosts = lazy(() => import("@/pages/website/posts"));
const SitePostForm = lazy(() => import("@/pages/website/post-form"));

export const websiteRoutes: {
  path: string;
  component: React.LazyExoticComponent<any>;
  subKey?: string;
  minRoleLevel?: number;
}[] = [
  { path: "/website", component: SiteSettings },
  { path: "/website/packages", component: SitePackages },
  { path: "/website/packages/create", component: SitePackageForm },
  { path: "/website/packages/:id/edit", component: SitePackageForm },
  { path: "/website/services", component: SiteServices },
  { path: "/website/services/create", component: SiteServiceForm },
  { path: "/website/services/:id/edit", component: SiteServiceForm },
  { path: "/website/hotels", component: SiteHotels },
  { path: "/website/hotels/create", component: SiteHotelForm },
  { path: "/website/hotels/:id/edit", component: SiteHotelForm },
  { path: "/website/posts", component: SitePosts },
  { path: "/website/posts/create", component: SitePostForm },
  { path: "/website/posts/:id/edit", component: SitePostForm },
];
