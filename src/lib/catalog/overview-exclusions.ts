// Owner's eight withheld catalogue entries. Match IDs even after a title is edited.
const withheld = new Set([
  "fU9dgPetb226", "SQpz6PgD4MUt", "KCKHCOSFfzg5", "c8VEP4fGk5Rd",
  "kyYjJPLvB3os", "zoCTOOLKITXx", "eI04lA2X21IC", "s5rgtTzkBZ34",
]);

export function excludedFromOverview(id: string, title?: string | null) {
  return withheld.has(id) || /andini[\W_]*permata/i.test(title ?? "");
}
