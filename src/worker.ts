import { handleFetch } from "@/routes";
import { handleEmail } from "@/sources/email/handler";
export default { fetch: handleFetch, email: handleEmail };
