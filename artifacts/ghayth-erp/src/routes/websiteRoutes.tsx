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
const SiteFaqs = lazy(() => import("@/pages/website/faqs"));
const SiteFaqForm = lazy(() => import("@/pages/website/faq-form"));
const SiteTestimonials = lazy(() => import("@/pages/website/testimonials"));
const SiteTestimonialForm = lazy(() => import("@/pages/website/testimonial-form"));
const SiteTeam = lazy(() => import("@/pages/website/team"));
const SiteTeamForm = lazy(() => import("@/pages/website/team-form"));
const SiteGallery = lazy(() => import("@/pages/website/gallery"));
const SiteGalleryForm = lazy(() => import("@/pages/website/gallery-form"));
const SiteBanners = lazy(() => import("@/pages/website/banners"));
const SiteBannerForm = lazy(() => import("@/pages/website/banner-form"));
const SiteNavItems = lazy(() => import("@/pages/website/nav-items"));
const SiteNavItemForm = lazy(() => import("@/pages/website/nav-item-form"));

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
  { path: "/website/faqs", component: SiteFaqs },
  { path: "/website/faqs/create", component: SiteFaqForm },
  { path: "/website/faqs/:id/edit", component: SiteFaqForm },
  { path: "/website/testimonials", component: SiteTestimonials },
  { path: "/website/testimonials/create", component: SiteTestimonialForm },
  { path: "/website/testimonials/:id/edit", component: SiteTestimonialForm },
  { path: "/website/team", component: SiteTeam },
  { path: "/website/team/create", component: SiteTeamForm },
  { path: "/website/team/:id/edit", component: SiteTeamForm },
  { path: "/website/gallery", component: SiteGallery },
  { path: "/website/gallery/create", component: SiteGalleryForm },
  { path: "/website/gallery/:id/edit", component: SiteGalleryForm },
  { path: "/website/banners", component: SiteBanners },
  { path: "/website/banners/create", component: SiteBannerForm },
  { path: "/website/banners/:id/edit", component: SiteBannerForm },
  { path: "/website/nav-items", component: SiteNavItems },
  { path: "/website/nav-items/create", component: SiteNavItemForm },
  { path: "/website/nav-items/:id/edit", component: SiteNavItemForm },
];
