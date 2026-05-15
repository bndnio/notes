import type { Profile } from "./lib/types";

const profiles: Record<string, Profile> = {
  brendon: {
    username: "brendon",
    notionDbId: "35fd7520e15c80b6abb9c1bc05f5d79b",
    notionToken: (env) => env.NOTION_TOKEN_BRENDON,
  },
};

export default profiles;
