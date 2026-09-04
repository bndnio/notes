import { handleFetch } from "@/routes";
import { handleEmail } from "@/pipeline/sources/email/handler";
export default { fetch: handleFetch, email: handleEmail };
