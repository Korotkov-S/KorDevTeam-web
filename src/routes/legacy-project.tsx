import { redirect, type LoaderFunctionArgs } from "react-router";
import { legacyProjectRedirect } from "../server/http/legacyProject";
import { documentHeaders } from "../server/http/cacheHeaders";
export { headers } from "../server/http/cacheHeaders";
export default function LegacyProject() { return null; }

export async function loader({ request }: LoaderFunctionArgs) {
  const target = await legacyProjectRedirect(request);
  if (!target) throw new Response(null, { status: 404, headers: documentHeaders });
  return redirect(target.href, { status: 301, headers: documentHeaders });
}
