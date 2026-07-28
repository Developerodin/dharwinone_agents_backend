import { redirect } from "next/navigation";

/** Catalog preview alias for gn_axon_v1 */
export default function LaunchAxonPreview() {
  redirect("/template-preview/generic/axon");
}
