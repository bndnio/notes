export function formField(form: FormData, name: string): string {
  return ((form.get(name) as string) ?? "").trim();
}
