import { trackContentOpen } from "../analytics";
import type { ViewReceipt } from "./contracts";
export function trackUniqueContentOpen(receipt: ViewReceipt | null): void {
  if (!receipt?.counted) return;
  const { kind: contentType, slug, path } = receipt.target;
  trackContentOpen({ contentType, slug, path });
}
