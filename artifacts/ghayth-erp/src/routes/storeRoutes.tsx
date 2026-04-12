import { lazy } from "react";

const Store = lazy(() => import("@/pages/store"));
const ProductsCreate = lazy(() => import("@/pages/create/store/products-create"));
const OrdersCreate = lazy(() => import("@/pages/create/store/orders-create"));
const OrderDetail = lazy(() => import("@/pages/store/order-detail"));
const ProductDetail = lazy(() => import("@/pages/store/product-detail"));

export const storeRoutes = [
  { path: "/store", component: Store },
  { path: "/store/products/create", component: ProductsCreate },
  { path: "/store/products/:id", component: ProductDetail },
  { path: "/store/orders", component: Store },
  { path: "/store/orders/create", component: OrdersCreate },
  { path: "/store/orders/:id", component: OrderDetail },
];
