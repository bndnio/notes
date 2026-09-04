// Wrangler's default module rules load .html and .txt imports as Text modules.
declare module "*.html" {
  const content: string;
  export default content;
}

declare module "*.txt" {
  const content: string;
  export default content;
}
