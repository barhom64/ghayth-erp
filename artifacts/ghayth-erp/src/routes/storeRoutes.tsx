import { lazy } from "react";

const Store = lazy(() => import("@/pages/store"));
const OrderDetail = lazy(() => import("@/pages/store/order-detail"));
const ProductDetail = lazy(() => import("@/pages/store/product-detail"));

export const storeRoutes = [
  { path: "/store", component: Store },
  { path: "/store/products", component: Store },
  { path: "/store/products/:id", component: ProductDetail },
  { path: "/store/orders", component: Store },
  { path: "/store/orders/:id", component: OrderDetail },
];
