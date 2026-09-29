import type { LoaderFunctionArgs } from "react-router";

import { getVkAdsReadService } from "../../server/advertising/vk/runtime";
import { getAdminAuthService } from "../../server/auth/runtime";
import { createVkAdsCreativeLoader } from "./ads-vk-creative.server";

export const loader = (args: LoaderFunctionArgs) => createVkAdsCreativeLoader(getAdminAuthService(), getVkAdsReadService())(args);
