export interface OptionLike {
  value: string;
  label: string;
}

export function normalizeOptionText(value: string): string {
  return value
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function semanticOptionTags(value: string): string[] {
  const normalized = normalizeOptionText(value);
  const tags = new Set<string>();

  if (/\b(man|male|masculine|he him|mr)\b/.test(normalized)) tags.add("male");
  if (/\b(woman|female|feminine|she her|ms|mrs|miss)\b/.test(normalized)) tags.add("female");
  if (/\b(non binary|nonbinary|genderqueer|they them)\b/.test(normalized)) tags.add("non_binary");
  if (/\b(prefer not|decline|rather not|not say|do not wish)\b/.test(normalized)) tags.add("prefer_not");

  const negative =
    /\b(no|false|not authorized|not authorised|unauthorized|unauthorised|not eligible|ineligible|do not agree|dont agree|do not consent|dont consent|do not require|dont require)\b/.test(
      normalized,
    );
  const positive =
    /\b(yes|true|authorized|authorised|eligible|agree|consent|confirm|acknowledge|require sponsorship)\b/.test(
      normalized,
    );
  if (negative) tags.add("no");
  else if (positive) tags.add("yes");

  if (/\b(united kingdom|uk|great britain|british)\b/.test(normalized)) tags.add("uk");
  if (/\b(united states|usa|us|america|american)\b/.test(normalized)) tags.add("us");

  return [...tags];
}

export function semanticOptionMatch(options: OptionLike[], wanted: string): OptionLike | null {
  const wantedTags = semanticOptionTags(wanted);
  if (!wantedTags.length) return null;

  const matches = options.filter((option) => {
    const optionTags = semanticOptionTags(`${option.value} ${option.label}`);
    return optionTags.some((tag) => wantedTags.includes(tag));
  });

  return matches.length === 1 ? matches[0] : null;
}
