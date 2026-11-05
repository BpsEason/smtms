import { SuppliersPage } from "./suppliers/SuppliersPage";
import { MaterialsPage as NewMaterialsPage } from "./materials/MaterialsPage";
import type { UserProfile } from "../types";

export function CatalogPages({
  kind,
  profile,
}: {
  kind: "suppliers" | "materials";
  profile: UserProfile | null;
}) {
  return kind === "suppliers" ? (
    <SuppliersPage profile={profile} />
  ) : (
    <NewMaterialsPage profile={profile} />
  );
}
