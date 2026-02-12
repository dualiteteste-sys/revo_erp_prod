import { describe, expect, it } from "vitest";
import { appRoutes } from "../app.routes";

function findRoute(path: string) {
  const app = appRoutes.find((route) => route.path === "/app");
  const children = Array.isArray(app?.children) ? app.children : [];
  return children.find((route) => route.path === path);
}

describe("WooCommerce dev panel route guards", () => {
  it("requires ops:manage for Woo list/detail routes", () => {
    const list = findRoute("desenvolvedor/woocommerce");
    const detail = findRoute("desenvolvedor/woocommerce/:storeId");

    const listPermission = (list as any)?.element?.props?.permission;
    const detailPermission = (detail as any)?.element?.props?.permission;

    expect(listPermission).toEqual({ domain: "ops", action: "manage" });
    expect(detailPermission).toEqual({ domain: "ops", action: "manage" });
  });
});
