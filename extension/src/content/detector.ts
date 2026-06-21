import type { DetectedField, FillPlan, JobApplyHint, JobContextSnapshot, PageFillRequest } from "../shared/types";

const FIELD_SELECTOR = "input, textarea, select";
const SKIP_INPUT_TYPES = new Set(["button", "submit", "reset", "image"]);
const FIELD_ATTR = "data-jobpal-field-id";

function cssEscape(value: string): string {
  return globalThis.CSS?.escape
    ? globalThis.CSS.escape(value)
    : value.replace(/["\\]/g, "\\$&").replace(/\s/g, "\\ ");
}

function visible(el: Element): boolean {
  const html = el as HTMLElement;
  const style = window.getComputedStyle(html);
  const rect = html.getBoundingClientRect();
  return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
}

function queryAllDeep<T extends Element>(selector: string, root: Document | ShadowRoot = document): T[] {
  const found = Array.from(root.querySelectorAll<T>(selector));
  for (const el of Array.from(root.querySelectorAll<HTMLElement>("*"))) {
    if (el.shadowRoot) found.push(...queryAllDeep<T>(selector, el.shadowRoot));
  }
  return found;
}

function queryOneInFieldRoot<T extends Element>(el: Element, selector: string): T | null {
  const root = el.getRootNode();
  if ("querySelector" in root) {
    return (root as Document | ShadowRoot).querySelector<T>(selector);
  }
  return document.querySelector<T>(selector);
}

function elementByIdInFieldRoot(el: Element, id: string): Element | null {
  const root = el.getRootNode();
  if ("getElementById" in root) {
    return (root as Document | ShadowRoot).getElementById(id);
  }
  return document.getElementById(id);
}

function fieldVisible(el: Element): boolean {
  if (visible(el)) return true;
  if (el instanceof HTMLInputElement && ["radio", "checkbox"].includes(el.type)) {
    const labels = el.labels ? Array.from(el.labels) : [];
    if (labels.some((label) => visible(label))) return true;
    const container = fieldContainer(el);
    return Boolean(container && visible(container));
  }
  return false;
}

function clean(text: string | null | undefined): string {
  return (text ?? "").replace(/\s+/g, " ").trim().slice(0, 500);
}

function normalizeChoice(text: string | null | undefined): string {
  return clean(text)
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function semanticChoiceTags(value: string): string[] {
  const normalized = normalizeChoice(value);
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

function choiceMatches(optionParts: string[], wanted: string): boolean {
  const target = normalizeChoice(wanted);
  if (!target) return false;
  const exactOrContains = optionParts.some((part) => {
    const normalized = normalizeChoice(part);
    if (!normalized) return false;
    if (normalized === target) return true;
    return target.length > 2 && (normalized.includes(target) || target.includes(normalized));
  });
  if (exactOrContains) return true;

  const targetTags = semanticChoiceTags(wanted);
  if (!targetTags.length) return false;
  return optionParts.some((part) => {
    const partTags = semanticChoiceTags(part);
    return partTags.some((tag) => targetTags.includes(tag));
  });
}

function cleanLong(text: string | null | undefined, max = 8000): string {
  return (text ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

function cleanMultiline(text: string | null | undefined, max = 12_000): string {
  return (text ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim()
    .slice(0, max);
}

function hashText(text: string): string {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function canonicalUrl(value = location.href): string {
  try {
    const url = new URL(value, location.href);
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) {
      if (/^(utm_|fbclid|gclid|msclkid|ref|source|gh_src)/i.test(key)) url.searchParams.delete(key);
    }
    return url.toString();
  } catch {
    return value.split("#")[0];
  }
}

function stripHtml(value: string): string {
  if (!/<[a-z][\s\S]*>/i.test(value)) return value;
  const div = document.createElement("div");
  div.innerHTML = value;
  return div.textContent || div.innerText || value;
}

function objectValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function textValue(value: unknown): string {
  if (typeof value === "string") return clean(value);
  if (typeof value === "number") return String(value);
  return "";
}

function longTextValue(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  return "";
}

interface JobMetadata {
  role?: string;
  company?: string;
  location?: string;
  description?: string;
  quality: number;
}

function typeIncludesJobPosting(value: unknown): boolean {
  const types = Array.isArray(value) ? value : [value];
  return types.some((item) => typeof item === "string" && item.toLowerCase() === "jobposting");
}

function collectJsonObjects(value: unknown, out: Record<string, unknown>[] = []): Record<string, unknown>[] {
  if (Array.isArray(value)) {
    for (const item of value) collectJsonObjects(item, out);
    return out;
  }
  const object = objectValue(value);
  if (!object) return out;
  out.push(object);
  collectJsonObjects(object["@graph"], out);
  collectJsonObjects(object.mainEntity, out);
  collectJsonObjects(object.itemListElement, out);
  return out;
}

function collectAllJsonObjects(value: unknown, out: Record<string, unknown>[] = [], depth = 0): Record<string, unknown>[] {
  if (out.length > 1200 || depth > 12) return out;
  if (Array.isArray(value)) {
    for (const item of value) collectAllJsonObjects(item, out, depth + 1);
    return out;
  }
  const object = objectValue(value);
  if (!object) return out;
  out.push(object);
  for (const nested of Object.values(object)) collectAllJsonObjects(nested, out, depth + 1);
  return out;
}

function nestedName(value: unknown): string {
  const object = objectValue(Array.isArray(value) ? value[0] : value);
  if (!object) return textValue(value);
  return textValue(object.name) || textValue(object.title);
}

function nestedLocation(value: unknown): string {
  const values = Array.isArray(value) ? value : [value];
  const parts = values
    .map((item) => {
      const object = objectValue(item);
      if (!object) return textValue(item);
      const address = objectValue(object.address);
      return [
        textValue(object.name),
        address ? [address.addressLocality, address.addressRegion, address.addressCountry].map(textValue).filter(Boolean).join(", ") : "",
      ]
        .filter(Boolean)
        .join(" - ");
    })
    .filter(Boolean);
  return clean(parts.join(" / "));
}

function roleFromTitle(value: string): string {
  const cleaned = clean(value)
    .replace(/^apply\s+(for|to)\s+/i, "")
    .replace(/\s+application$/i, "")
    .replace(/\s+job description$/i, "")
    .trim();
  const firstPart = cleaned.split(/\s[-|]\s/).map((part) => part.trim()).filter(Boolean)[0] || cleaned;
  return firstPart.replace(/\s*[-|]\s*(jobs?|careers?|greenhouse|lever|workday).*$/i, "").trim();
}

function metadataFromObject(object: Record<string, unknown>, quality = 0.74): JobMetadata | null {
  const role = textValue(object.title) || textValue(object.jobTitle) || textValue(object.role) || textValue(object.name);
  const company =
    nestedName(object.hiringOrganization) ||
    nestedName(object.organization) ||
    nestedName(object.company) ||
    nestedName(object.employer);
  const location = nestedLocation(object.jobLocation) || nestedLocation(object.location) || textValue(object.locationName);
  const rawDescription =
    longTextValue(object.description) ||
    longTextValue(object.jobDescription) ||
    longTextValue(object.descriptionHtml) ||
    longTextValue(object.content) ||
    longTextValue(object.body);
  const description = cleanMultiline(stripHtml(rawDescription), 12_000);
  if (!description && !role && !company) return null;
  return {
    role: role || undefined,
    company: company || undefined,
    location: location || undefined,
    description: description || undefined,
    quality: quality + (description.length > 1000 ? 0.08 : 0) + (role ? 0.04 : 0) + (company ? 0.04 : 0),
  };
}

function jsonLdJobPostings(): JobMetadata[] {
  const results: JobMetadata[] = [];
  for (const script of Array.from(document.querySelectorAll<HTMLScriptElement>("script[type='application/ld+json']"))) {
    try {
      const parsed = JSON.parse(script.textContent || "null") as unknown;
      const postings = collectJsonObjects(parsed).filter((object) => typeIncludesJobPosting(object["@type"]));
      for (const posting of postings) {
        const metadata = metadataFromObject(posting, 0.88);
        if (metadata) results.push(metadata);
      }
    } catch {
      // Ignore malformed site metadata.
    }
  }
  return results;
}

function microdataJobPostings(): JobMetadata[] {
  return queryAllDeep<HTMLElement>("[itemscope][itemtype*='JobPosting' i], [itemtype*='schema.org/JobPosting' i]")
    .map((root) => {
      const prop = (name: string) => {
        const el = root.querySelector<HTMLElement>(`[itemprop='${name}']`);
        if (!el) return "";
        if (el instanceof HTMLMetaElement) return el.content;
        return el.getAttribute("content") || el.innerText || el.textContent || "";
      };
      const organization = root.querySelector<HTMLElement>("[itemprop='hiringOrganization'], [itemprop='organization']");
      const location = root.querySelector<HTMLElement>("[itemprop='jobLocation'], [itemprop='location']");
      const description = prop("description") || root.innerText || root.textContent || "";
      return {
        role: clean(prop("title") || prop("name")) || undefined,
        company: clean(organization?.textContent) || undefined,
        location: clean(location?.textContent) || undefined,
        description: cleanMultiline(stripHtml(description), 12_000),
        quality: 0.8,
      };
    })
    .filter((metadata) => metadata.description || metadata.role || metadata.company);
}

function hydrationJobPostings(): JobMetadata[] {
  const scripts = Array.from(
    document.querySelectorAll<HTMLScriptElement>(
      "script[type='application/json'], script#__NEXT_DATA__, script[id*='NEXT_DATA'], script[id*='__data'], script[id*='initial' i]",
    ),
  );
  const results: JobMetadata[] = [];
  for (const script of scripts) {
    const text = script.textContent?.trim() || "";
    if (!text || text.length > 1_500_000 || !/job|career|description|posting|requisition|opening/i.test(text)) continue;
    try {
      const parsed = JSON.parse(text) as unknown;
      for (const object of collectAllJsonObjects(parsed)) {
        const metadata = metadataFromObject(object, 0.66);
        if (!metadata?.description || metadata.description.length < 350) continue;
        if (!metadata.role && !hasJobDescriptionLanguage(metadata.description)) continue;
        results.push(metadata);
      }
    } catch {
      // Ignore non-JSON hydration payloads.
    }
  }
  return results;
}

function metaJobPosting(): JobMetadata | null {
  const meta = (selector: string) => clean(document.querySelector<HTMLMetaElement>(selector)?.content);
  const description =
    meta("meta[property='og:description']") ||
    meta("meta[name='description']") ||
    meta("meta[name='twitter:description']");
  const title = meta("meta[property='og:title']") || meta("meta[name='twitter:title']") || document.title;
  const site = meta("meta[property='og:site_name']") || meta("meta[name='application-name']");
  if (!description && !title) return null;
  return {
    role: roleFromTitle(title) || undefined,
    company: site && !/jobs?|careers?|application/i.test(site) ? site : undefined,
    description: cleanMultiline(description, 3000),
    quality: description.length > 350 ? 0.52 : 0.34,
  };
}

function structuredJobMetadata(): JobMetadata | null {
  return [...jsonLdJobPostings(), ...microdataJobPostings(), ...hydrationJobPostings(), metaJobPosting()]
    .filter((metadata): metadata is JobMetadata => Boolean(metadata))
    .sort((a, b) => {
      const aScore = a.quality + (a.description?.length ?? 0) / 20_000;
      const bScore = b.quality + (b.description?.length ?? 0) / 20_000;
      return bScore - aScore;
    })[0] ?? null;
}

function hasJobDescriptionLanguage(text: string): boolean {
  return /responsibilities|requirements|qualifications|about the role|the role|what you.?ll do|what we.?re looking for|you will|we are looking|experience with|skills|benefits|compensation|salary|department|team/i.test(
    text,
  );
}

function optionValueFor(input: HTMLInputElement): string {
  const label = clean(labelFor(input));
  return input.value && input.value !== "on" ? input.value : label;
}

function fieldContainer(el: Element): Element | null {
  return el.closest(
    "fieldset, .ashby-application-form-field-entry, [class*='fieldEntry'], [data-testid*='field' i], [role='group']",
  );
}

function groupLabelFor(el: Element): string {
  const container = fieldContainer(el);
  const heading = container?.querySelector(
    "legend, .ashby-application-form-question-title, [class*='question-title'], [class*='heading']",
  );
  if (heading) return clean(heading.textContent);
  const fieldset = el.closest("fieldset");
  const legend = fieldset?.querySelector("legend");
  if (legend) return clean(legend.textContent);
  return "";
}

function labelFor(el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement): string {
  const labels = "labels" in el && el.labels ? Array.from(el.labels).map((l) => l.textContent) : [];
  if (labels.length) return clean(labels.join(" "));
  const ariaLabelledBy = el.getAttribute("aria-labelledby");
  if (ariaLabelledBy) {
    const text = ariaLabelledBy
      .split(/\s+/)
      .map((id) => elementByIdInFieldRoot(el, id)?.textContent)
      .filter(Boolean)
      .join(" ");
    if (text) return clean(text);
  }
  if (el.id) {
    const explicit = queryOneInFieldRoot(el, `label[for="${cssEscape(el.id)}"]`);
    if (explicit) return clean(explicit.textContent);
  }
  return clean(
    el.getAttribute("aria-label") ||
      el.closest("label")?.textContent ||
      groupLabelFor(el) ||
      "",
  );
}

// The helper/subtitle text under a field's title — the canonical source is
// aria-describedby, which ATS forms use for instructions like
// "list any other languages… if none apply, enter NA". This is the single most
// important signal for the model to answer the field correctly, so it leads.
function describedByText(el: Element): string {
  const ids = el.getAttribute("aria-describedby");
  if (!ids) return "";
  const text = ids
    .split(/\s+/)
    .map((id) => elementByIdInFieldRoot(el, id)?.textContent)
    .filter(Boolean)
    .join(" ");
  return clean(text);
}

// Full context the backend reasons over: the field's instruction text first,
// then positional/nearby text as a fallback.
function fieldContext(el: Element): string {
  const described = describedByText(el);
  const nearby = nearbyText(el);
  if (described && nearby) return clean(`${described} ${nearby}`);
  return described || nearby;
}

function nearbyText(el: Element): string {
  const parts: string[] = [];
  const groupLabel = groupLabelFor(el);
  if (groupLabel) parts.push(groupLabel);

  let sibling = el.previousElementSibling;
  for (let i = 0; i < 2 && sibling; i++) {
    parts.push(clean(sibling.textContent));
    sibling = sibling.previousElementSibling;
  }
  sibling = el.nextElementSibling;
  for (let i = 0; i < 1 && sibling; i++) {
    if (!["LABEL", "INPUT", "TEXTAREA", "SELECT", "BUTTON"].includes(sibling.tagName)) {
      parts.push(clean(sibling.textContent));
    }
    sibling = sibling.nextElementSibling;
  }

  const parent = el.parentElement;
  if (parent && !["FORM", "MAIN", "BODY", "HTML", "SECTION"].includes(parent.tagName)) {
    parts.push(clean(parent.textContent));
  }
  return clean(parts.join(" "));
}

function stableId(
  el: Element,
  index: number,
  overrideSeed?: string,
  targets: Element[] = [el],
): string {
  const current = el.getAttribute(FIELD_ATTR);
  if (current) return current;
  const seed =
    overrideSeed ??
    [
      (el as HTMLInputElement).name,
      (el as HTMLElement).id,
      el.getAttribute("placeholder"),
      labelFor(el as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement),
      index,
    ].join("|");
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  const id = `jp-${index}-${hash.toString(36)}`;
  for (const target of targets) target.setAttribute(FIELD_ATTR, id);
  return id;
}

function cssSelector(el: Element): string {
  const fieldId = el.getAttribute(FIELD_ATTR);
  if (fieldId) return `[${FIELD_ATTR}="${cssEscape(fieldId)}"]`;
  if ((el as HTMLElement).id) return `#${cssEscape((el as HTMLElement).id)}`;
  return FIELD_SELECTOR;
}

function optionsFor(el: Element): { value: string; label: string }[] {
  if (el instanceof HTMLSelectElement) {
    return Array.from(el.options).map((o) => ({ value: o.value, label: clean(o.textContent) }));
  }
  if (el instanceof HTMLInputElement && ["radio", "checkbox"].includes(el.type) && el.name) {
    return queryAllDeep<HTMLInputElement>(`input[name="${cssEscape(el.name)}"]`)
      .filter((i) => fieldVisible(i))
      .map((i) => {
        const label = labelFor(i) || i.value;
        return { value: optionValueFor(i), label };
      });
  }
  return [];
}

function valueFor(el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement): string {
  if (el instanceof HTMLInputElement && (el.type === "checkbox" || el.type === "radio")) {
    return el.checked ? el.value : "";
  }
  return el.value;
}

function hasMeaningfulValue(el: Element): boolean {
  if (el instanceof HTMLInputElement) {
    if (el.type === "checkbox" || el.type === "radio") return el.checked;
    return clean(el.value).length > 0;
  }
  if (el instanceof HTMLTextAreaElement) return clean(el.value).length > 0;
  if (el instanceof HTMLSelectElement) return clean(el.value).length > 0;
  if (isComboboxControl(el)) {
    const control = comboboxControl(el);
    if (control instanceof HTMLInputElement && clean(control.value)) return true;
    return Boolean(clean(el.querySelector("[class*='singleValue'], [class*='single-value']")?.textContent || ""));
  }
  return false;
}

function detectChoiceGroups(startIndex: number): DetectedField[] {
  const groupIds = new WeakMap<Element, number>();
  let nextGroupId = 0;
  const groupKeyFor = (input: HTMLInputElement): string => {
    const container = fieldContainer(input);
    const groupLabel = groupLabelFor(input);
    if (container && groupLabel) {
      if (!groupIds.has(container)) groupIds.set(container, nextGroupId++);
      return `${input.type}:container:${groupIds.get(container)}`;
    }
    return `${input.type}:name:${input.name || input.id}`;
  };
  const byGroup = new Map<string, HTMLInputElement[]>();
  for (const input of queryAllDeep<HTMLInputElement>("input[type='radio'], input[type='checkbox']")) {
    if (!fieldVisible(input)) continue;
    const key = groupKeyFor(input);
    byGroup.set(key, [...(byGroup.get(key) ?? []), input]);
  }

  return Array.from(byGroup.values()).map((inputs, offset) => {
    const first = inputs[0];
    const groupLabel = groupLabelFor(first) || labelFor(first);
    const id = stableId(
      first,
      startIndex + offset,
      [first.type, first.name, groupLabel, inputs.map((input) => labelFor(input)).join("|")].join("|"),
      inputs,
    );
    const selected = inputs
      .filter((input) => input.checked)
      .map((input) => optionValueFor(input))
      .join(" || ");
    return {
      id,
      selector: cssSelector(first),
      tagName: "input",
      inputType: first.type,
      label: groupLabel,
      name: first.name,
      idAttr: first.id,
      placeholder: "",
      autocomplete: "",
      value: selected,
      required: inputs.some((input) => input.required),
      maxLength: undefined,
      multi: first.type === "checkbox",
      options: inputs.map((input) => {
        const label = labelFor(input) || input.value;
        return { value: optionValueFor(input), label };
      }),
      context: groupLabel,
    };
  });
}

// Custom (non-native) dropdown widgets: react-select, Workday, Ashby, Lever,
// and any ARIA combobox/listbox. These render options in a pop-up the detector
// cannot read at scan time, so they are filled by operating the live widget.
const CUSTOM_SELECT_SELECTOR = [
  "[role='combobox']",
  "[aria-haspopup='listbox']",
  "[aria-autocomplete='list']",
  "[class*='select__control']",
  "[class*='select-control']",
  "[class*='Select-control']",
  "[data-automation-id*='selectinput' i]",
  "[data-automation-id*='multiselectContainer' i]",
].join(", ");

function isComboboxControl(el: Element): boolean {
  if (el instanceof HTMLSelectElement) return false;
  if (typeof el.matches === "function" && el.matches(CUSTOM_SELECT_SELECTOR)) return true;
  const role = el.getAttribute?.("role");
  return role === "combobox" || el.getAttribute?.("aria-haspopup") === "listbox";
}

// The focusable element to drive for a custom widget — prefer an inner <input>.
function comboboxControl(el: Element): HTMLElement {
  if (el instanceof HTMLInputElement) return el;
  const inner = el.querySelector<HTMLElement>("input, [role='combobox'], button");
  return inner ?? (el as HTMLElement);
}

function explicitLabel(el: Element): string {
  const aria = el.getAttribute("aria-label");
  if (aria) return clean(aria);
  const labelledBy = el.getAttribute("aria-labelledby");
  if (labelledBy) {
    const text = labelledBy
      .split(/\s+/)
      .map((id) => elementByIdInFieldRoot(el, id)?.textContent)
      .filter(Boolean)
      .join(" ");
    if (text) return clean(text);
  }
  const id = (el as HTMLElement).id;
  if (id) {
    const explicit = queryOneInFieldRoot(el, `label[for="${cssEscape(id)}"]`);
    if (explicit) return clean(explicit.textContent);
  }
  const wrapLabel = el.closest("label");
  if (wrapLabel) return clean(wrapLabel.textContent);
  return "";
}

// A custom widget's accessible name can live on either the focusable control or
// its wrapper. Prefer an explicit label from either before any positional guess,
// so we don't accidentally absorb the pop-up listbox text as the field label.
function widgetLabel(el: Element, control: Element): string {
  return (
    explicitLabel(control) ||
    explicitLabel(el) ||
    clean(groupLabelFor(el) || nearbyText(el))
  );
}

function detectComboboxWidgets(startIndex: number, controls: Set<Element>): DetectedField[] {
  const widgets = queryAllDeep<HTMLElement>(CUSTOM_SELECT_SELECTOR)
    .filter((el) => fieldVisible(el) || visible(el))
    .filter((el) => !(el instanceof HTMLSelectElement))
    .filter((el) => !el.closest("select"));

  const fields: DetectedField[] = [];
  const seen = new Set<Element>();
  let offset = 0;
  for (const el of widgets) {
    const control = comboboxControl(el);
    if (seen.has(control)) continue;
    seen.add(control);
    controls.add(control);
    const label = widgetLabel(el, control);
    const placeholder = control instanceof HTMLInputElement ? control.placeholder : "";
    const id = stableId(
      control,
      startIndex + offset,
      ["combobox", (control as HTMLInputElement).name, control.id, label, placeholder].join("|"),
      [control, el],
    );
    const currentValue =
      control instanceof HTMLInputElement && control.value
        ? clean(control.value)
        : clean(el.querySelector("[class*='singleValue'], [class*='single-value']")?.textContent || "");
    fields.push({
      id,
      selector: cssSelector(control),
      tagName: control.tagName.toLowerCase(),
      inputType: "combobox",
      label,
      name: (control as HTMLInputElement).name || "",
      idAttr: control.id || "",
      placeholder,
      autocomplete: control.getAttribute("autocomplete") || "",
      value: currentValue,
      required: control.getAttribute("aria-required") === "true",
      maxLength: undefined,
      multi: el.getAttribute("aria-multiselectable") === "true",
      options: [],
      context: fieldContext(el),
    });
    offset += 1;
  }
  return fields;
}

export function detectFields(): DetectedField[] {
  const comboboxControls = new Set<Element>();
  const comboboxFields = detectComboboxWidgets(0, comboboxControls);

  const scalarFields = queryAllDeep<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(FIELD_SELECTOR)
    .filter((el) => fieldVisible(el))
    .filter((el) => !(el instanceof HTMLInputElement && SKIP_INPUT_TYPES.has(el.type)))
    .filter((el) => !(el instanceof HTMLInputElement && ["radio", "checkbox"].includes(el.type)))
    .filter((el) => !comboboxControls.has(el) && !isComboboxControl(el))
    .map((el, index) => {
      const id = stableId(el, comboboxFields.length + index);
      return {
        id,
        selector: cssSelector(el),
        tagName: el.tagName.toLowerCase(),
        inputType: el instanceof HTMLInputElement ? el.type : el.tagName.toLowerCase(),
        label: labelFor(el),
        name: "name" in el ? el.name : "",
        idAttr: el.id,
        placeholder: "placeholder" in el ? el.placeholder : "",
        autocomplete: el.getAttribute("autocomplete") || "",
        value: valueFor(el),
        required: "required" in el ? el.required : false,
        maxLength: "maxLength" in el && el.maxLength > 0 ? el.maxLength : undefined,
        multi: false,
        options: optionsFor(el),
        context: fieldContext(el),
      };
    });
  return [
    ...comboboxFields,
    ...scalarFields,
    ...detectChoiceGroups(comboboxFields.length + scalarFields.length),
  ];
}

function textFromSelectors(selectors: string[]): string {
  const chunks: string[] = [];
  for (const selector of selectors) {
    for (const el of queryAllDeep<HTMLElement>(selector).slice(0, 6)) {
      const text = cleanLong((el as HTMLElement).innerText || el.textContent || "", 2500);
      if (text) chunks.push(text);
    }
  }
  return cleanLong(chunks.join("\n"), 8000);
}

function inferRole(): string | undefined {
  const fromStructured = structuredJobMetadata()?.role;
  if (fromStructured) return fromStructured;
  const heading = clean(document.querySelector("h1")?.textContent);
  const ogTitle = clean(document.querySelector<HTMLMetaElement>("meta[property='og:title']")?.content);
  const title = clean(document.title);
  const source = heading || ogTitle || title;
  return roleFromTitle(source) || undefined;
}

function inferCompany(): string | undefined {
  const fromStructured = structuredJobMetadata()?.company;
  if (fromStructured) return fromStructured;
  const meta = document.querySelector<HTMLMetaElement>("meta[property='og:site_name'], meta[name='application-name']");
  const fromMeta = clean(meta?.content);
  if (fromMeta && !/jobs?|careers?|application/i.test(fromMeta)) return fromMeta;

  const title = clean(document.title);
  const parts = title.split(/\s[-|]\s/).map((part) => part.trim()).filter(Boolean);
  const likely = [...parts].reverse().find((part) => !/jobs?|careers?|application|apply/i.test(part));
  return likely && likely !== parts[0] ? likely : undefined;
}

function inferLocation(): string | undefined {
  const fromStructured = structuredJobMetadata()?.location;
  if (fromStructured) return fromStructured;
  const selectors = [
    "[data-testid*='location' i]",
    "[class*='location' i]",
    "[id*='location' i]",
    "[class*='department' i]",
  ];
  for (const selector of selectors) {
    const text = clean(queryAllDeep<HTMLElement>(selector)[0]?.innerText || queryAllDeep<HTMLElement>(selector)[0]?.textContent);
    if (text && text.length < 140 && !/location|department/i.test(text)) return text;
  }
  const meta = clean(document.querySelector<HTMLMetaElement>("meta[name='job-location'], meta[property='job:location']")?.content);
  return meta || undefined;
}

function extractJobContext(): PageFillRequest["jobContext"] {
  const description =
    textFromSelectors([
      "[data-testid*='description' i]",
      "[class*='job-description' i]",
      "[class*='description' i]",
      "[id*='job-description' i]",
      "[id*='description' i]",
      "article",
      "main",
    ]) || cleanLong(document.body?.innerText || document.body?.textContent || "", 8000);

  return {
    company: inferCompany(),
    role: inferRole(),
    description,
  };
}

function extractDescriptionCandidates(): string[] {
  const structuredDescriptions = [structuredJobMetadata()?.description].filter((item): item is string => Boolean(item));
  const selectors = [
    "[data-testid*='description' i]",
    "[data-qa*='description' i]",
    "[class*='job-description' i]",
    "[class*='jobDescription' i]",
    "[class*='description' i]",
    "[id*='job-description' i]",
    "[id*='description' i]",
    "[class*='posting' i]",
    "[class*='job-details' i]",
    "[class*='jobDetails' i]",
    "article",
    "main",
  ];
  const chunks: string[] = [];
  for (const description of structuredDescriptions) {
    if (description.length > 250) chunks.push(description);
  }
  for (const selector of selectors) {
    for (const el of queryAllDeep<HTMLElement>(selector).slice(0, 8)) {
      if (!visible(el)) continue;
      const text = cleanMultiline(el.innerText || el.textContent || "");
      if (text.length > 350) chunks.push(text);
    }
    if (chunks.length) break;
  }
  const body = cleanMultiline(document.body?.innerText || document.body?.textContent || "");
  if (body.length > 350) chunks.push(body);
  return [...new Set(chunks)].slice(0, 4);
}

function scoreDescription(text: string): number {
  let score = 0;
  if (text.length > 600) score += 0.24;
  if (text.length > 1600) score += 0.12;
  if (/responsibilities|what you.?ll do|role overview|about the role|the role/i.test(text)) score += 0.18;
  if (/requirements|what we.?re looking for|qualifications|skills|experience/i.test(text)) score += 0.18;
  if (/benefits|compensation|salary|perks|working at/i.test(text)) score += 0.07;
  if (/apply now|submit application|start application/i.test(text)) score += 0.06;
  if (hasJobDescriptionLanguage(text)) score += 0.08;
  if (detectFields().length > 10 && text.length < 2500) score -= 0.15;
  return score;
}

function applyHints(): JobApplyHint[] {
  const now = new Date().toISOString();
  const candidates = queryAllDeep<HTMLElement>("a, button, [role='button']")
    .filter((el) => fieldVisible(el) || visible(el))
    .map((el) => {
      const text = clean(el.textContent || el.getAttribute("aria-label") || el.getAttribute("title") || "");
      const href = el instanceof HTMLAnchorElement ? canonicalUrl(el.href) : undefined;
      return { text, href, capturedAt: now };
    })
    .filter((item) => /\b(apply|start application|submit application|quick apply)\b/i.test(item.text))
    .filter((item) => item.text.length <= 120);
  return candidates.slice(0, 8);
}

function jobPageSignals(text: string): number {
  const url = `${location.hostname} ${location.pathname}`.toLowerCase();
  const title = document.title.toLowerCase();
  let score = 0;
  if (/jobs?|careers?|greenhouse|lever|ashby|workday|recruitee|teamtailor|bamboohr|smartrecruiters|jobvite/.test(url)) {
    score += 0.16;
  }
  if (/job|career|opening|vacancy|position|apply/.test(title)) score += 0.08;
  if (inferRole()) score += 0.1;
  if (inferCompany()) score += 0.06;
  if (applyHints().length) score += 0.12;
  return score + scoreDescription(text);
}

export function collectJobContextSnapshot(source: JobContextSnapshot["source"] = "job_page"): JobContextSnapshot | null {
  const candidates = extractDescriptionCandidates();
  const description = candidates.sort((a, b) => jobPageSignals(b) - jobPageSignals(a))[0] || "";
  const confidence = Math.max(0, Math.min(0.98, jobPageSignals(description)));
  const role = inferRole();
  const company = inferCompany();
  const canonical = canonicalUrl();
  const now = new Date().toISOString();
  if (!description && !role && !company) return null;
  return {
    id: `job-${hashText([canonical, role, company, description.slice(0, 400)].join("|"))}`,
    url: location.href,
    canonicalUrl: canonical,
    title: document.title,
    role,
    company,
    location: inferLocation(),
    description: cleanMultiline(description, 12_000),
    descriptionLength: cleanMultiline(description, 12_000).length,
    source,
    confidence,
    capturedAt: now,
    lastSeenAt: now,
    applyHints: applyHints(),
  };
}

export function collectPage(): PageFillRequest {
  const bodyText = cleanLong(document.body?.innerText || "");
  return {
    url: location.href,
    title: document.title,
    pageTextSummary: bodyText || cleanLong(document.body?.textContent || "", 8000),
    jobContext: extractJobContext(),
    fields: detectFields(),
  };
}

function setNativeValue(el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, value: string): void {
  const proto =
    el instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : el instanceof HTMLSelectElement
        ? HTMLSelectElement.prototype
        : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
  setter?.call(el, value);
}

function setNativeChecked(el: HTMLInputElement, checked: boolean): void {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "checked")?.set;
  setter?.call(el, checked);
}

function dispatch(el: HTMLElement): void {
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
  el.dispatchEvent(new FocusEvent("blur", { bubbles: true }));
}

function clickChoice(input: HTMLInputElement): void {
  const labels = input.labels ? Array.from(input.labels) : [];
  const label = labels.find((item) => visible(item));
  if (label) label.click();
  else input.click();
}

function setChoiceState(input: HTMLInputElement, checked: boolean): boolean {
  if (input.checked === checked) {
    dispatch(input);
    return checked;
  }
  clickChoice(input);
  if (input.checked !== checked) {
    setNativeChecked(input, checked);
    dispatch(input);
  }
  return input.checked === checked;
}

function applyToElement(el: Element, value: string): boolean {
  if (hasMeaningfulValue(el)) return false;
  if (el instanceof HTMLSelectElement) {
    const option = Array.from(el.options).find((o) => choiceMatches([o.value, clean(o.textContent)], value));
    if (!option) return false;
    setNativeValue(el, option.value);
    dispatch(el);
    return true;
  }
  if (el instanceof HTMLTextAreaElement) {
    setNativeValue(el, value);
    dispatch(el);
    return true;
  }
  if (el instanceof HTMLInputElement) {
    if (el.type === "checkbox" || el.type === "radio") {
      const shouldCheck = choiceMatches([el.value, labelFor(el)], value);
      return setChoiceState(el, shouldCheck) && shouldCheck;
    }
    setNativeValue(el, value);
    dispatch(el);
    return true;
  }
  return false;
}

function localUploadText(input: HTMLInputElement): string {
  const parts: string[] = [
    input.name,
    input.id,
    input.accept,
    input.getAttribute("aria-label"),
    input.getAttribute("data-testid"),
    labelFor(input),
    nearbyText(input),
  ].filter(Boolean) as string[];

  let current: Element | null = input;
  for (let depth = 0; current && depth < 4; depth++, current = current.parentElement) {
    parts.push(clean(current.textContent));
    parts.push(clean(current.previousElementSibling?.textContent));
    parts.push(clean(current.nextElementSibling?.textContent));
  }
  return parts.filter(Boolean).join(" ").toLowerCase();
}

function fileInputScore(input: HTMLInputElement): number {
  const corpus = localUploadText(input);
  let score = 0;
  if (/\b(resume|résumé|cv|curriculum vitae)\b/.test(corpus)) score += 8;
  if (/upload|attach|choose|file/.test(corpus)) score += 2;
  if (/pdf|doc|docx|application\/pdf/.test(corpus)) score += 1;
  if (/cover letter|portfolio|transcript|certificate/.test(corpus)) score -= 6;
  return score;
}

function resumeUploadInput(): HTMLInputElement | null {
  const inputs = queryAllDeep<HTMLInputElement>("input[type='file']");
  const scored = inputs
    .map((input) => ({ input, score: fileInputScore(input) }))
    .sort((a, b) => b.score - a.score);
  const strong = scored.find((item) => item.score >= 5);
  if (strong) return strong.input;
  if (scored.length === 1 && scored[0].score >= 3 && !/cover letter|portfolio|transcript|certificate/.test(localUploadText(scored[0].input))) {
    return scored[0].input;
  }
  return null;
}

function bytesFromBase64(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function findResumeUploadField(): { found: boolean; label?: string } {
  const input = resumeUploadInput();
  return {
    found: Boolean(input),
    label: input ? labelFor(input) || nearbyText(input) || "Resume upload" : undefined,
  };
}

export function attachResumeFile(file: { fileName: string; mime: string; base64: string }): {
  attached: boolean;
  reason?: string;
  label?: string;
} {
  const input = resumeUploadInput();
  if (!input) return { attached: false, reason: "No resume upload field found." };
  if (input.disabled) return { attached: false, reason: "Resume upload field is disabled." };
  try {
    const bytes = bytesFromBase64(file.base64);
    const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(new File([buffer], file.fileName, { type: file.mime }));
    input.files = dataTransfer.files;
    dispatch(input);
    return {
      attached: input.files?.length === 1,
      reason: input.files?.length === 1 ? undefined : "The upload widget rejected the generated file.",
      label: labelFor(input) || nearbyText(input) || "Resume upload",
    };
  } catch (err) {
    return {
      attached: false,
      reason: err instanceof Error ? err.message : "Could not attach the generated resume.",
      label: labelFor(input) || nearbyText(input) || "Resume upload",
    };
  }
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function fireKey(el: HTMLElement, key: string): void {
  for (const type of ["keydown", "keypress", "keyup"] as const) {
    el.dispatchEvent(new KeyboardEvent(type, { bubbles: true, cancelable: true, key, code: key }));
  }
}

// Find the visible pop-up option matching `wanted`. Custom widgets render their
// listbox in a portal at the document root, so we scan the whole tree.
function findListboxOption(wanted: string): HTMLElement | null {
  const options = queryAllDeep<HTMLElement>(
    "[role='option'], [class*='select__option'], [class*='Select-option'], li[role='option'], [data-automation-id*='promptOption' i]",
  ).filter((el) => visible(el));
  if (!options.length) return null;
  const exact = options.find((o) =>
    choiceMatches([clean(o.textContent), o.getAttribute("data-value") || "", o.getAttribute("aria-label") || ""], wanted),
  );
  return exact ?? null;
}

// Operate a live custom dropdown: open it, type to filter, click the match.
async function applyComboboxValue(control: HTMLElement, value: string): Promise<boolean> {
  const wanted = value.split(/\s*\|\|\s*/)[0].trim();
  if (!wanted) return false;

  control.scrollIntoView?.({ block: "center", behavior: "instant" as ScrollBehavior });
  control.focus?.();
  control.click();
  await wait(140);

  const typeInput =
    control instanceof HTMLInputElement ? control : control.querySelector<HTMLInputElement>("input");

  if (typeInput) {
    setNativeValue(typeInput, wanted);
    typeInput.dispatchEvent(new Event("input", { bubbles: true }));
    fireKey(typeInput, wanted.slice(-1) || "a");
    await wait(280);
  }

  let option = findListboxOption(wanted);
  if (!option) {
    // Nudge the widget to render/highlight a match, then re-scan.
    fireKey(typeInput ?? control, "ArrowDown");
    await wait(160);
    option = findListboxOption(wanted);
  }

  if (option) {
    option.click();
    await wait(80);
    return true;
  }

  // Last resort: accept whatever the widget has highlighted from our typed text.
  if (typeInput && typeInput.value.trim()) {
    fireKey(typeInput, "Enter");
    await wait(80);
    return true;
  }

  // Close the menu so we don't leave the page in a half-open state.
  control.dispatchEvent(new Event("blur", { bubbles: true }));
  return false;
}

export async function applyFillPlan(plan: FillPlan): Promise<{ filled: number }> {
  let filled = 0;
  for (const answer of plan.answers) {
    const elements = queryAllDeep(`[${FIELD_ATTR}="${cssEscape(answer.fieldId)}"]`);
    if (!elements.length) continue;

    const comboTarget = elements.find((el) => isComboboxControl(el));
    if (comboTarget) {
      if (hasMeaningfulValue(comboTarget)) continue;
      if (await applyComboboxValue(comboTarget as HTMLElement, answer.value)) filled++;
      continue;
    }

    const choiceInputs = elements.filter(
      (el): el is HTMLInputElement =>
        el instanceof HTMLInputElement && (el.type === "radio" || el.type === "checkbox"),
    );
    if (choiceInputs.length) {
      if (choiceInputs.some((input) => input.checked)) continue;
      const wanted = answer.value
        .split(/\s*\|\|\s*|\s*,\s*|\s*;\s*/)
        .map((item) => item.trim().toLowerCase())
        .filter(Boolean);
      let changed = false;
      const radioTarget = choiceInputs.find((input) => {
        const optionParts = [optionValueFor(input), labelFor(input), input.value];
        return wanted.some((item) => choiceMatches(optionParts, item));
      });
      for (const input of choiceInputs) {
        if (input.type === "radio") {
          const shouldCheck = input === radioTarget;
          if (shouldCheck) changed = setChoiceState(input, true) || changed;
          else if (input.checked) setChoiceState(input, false);
          continue;
        }
        if (input.type === "checkbox") {
          const shouldCheck = wanted.some((item) => choiceMatches([optionValueFor(input), labelFor(input), input.value], item));
          const applied = setChoiceState(input, shouldCheck);
          if (shouldCheck && applied) changed = true;
        }
      }
      if (changed) filled++;
      continue;
    }
    if (applyToElement(elements[0], answer.value)) filled++;
  }
  return { filled };
}
