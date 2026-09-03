import { handleFetch } from "./handlers/fetch";
import { handleEmail } from "./sources/email/handler";
export default { fetch: handleFetch, email: handleEmail };
