import { handleFetch } from "@/routes";
import { handleEmail } from "@/pipeline/sources/email/handler";
import { bindEphemeralKv } from "@/kv/namespace";
import type { Env } from "@/lib/types";

export default {
  fetch(request: Request, env: Env) {
    bindEphemeralKv(env);
    return handleFetch(request, env);
  },
  email(message: ForwardableEmailMessage, env: Env) {
    bindEphemeralKv(env);
    return handleEmail(message, env);
  },
};
