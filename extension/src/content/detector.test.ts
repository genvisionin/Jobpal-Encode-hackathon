import { describe, expect, it, beforeEach, vi } from "vitest";
import {
  applyFillPlan,
  collectJobContextSnapshot,
  collectPage,
  detectFields,
  findResumeUploadField,
} from "./detector";

const fixture = `
  <main>
    <h1>Product Manager application</h1>
    <form>
      <label for="first">First name</label>
      <input id="first" name="first_name" />

      <label for="email">Email address</label>
      <input id="email" type="email" name="email" />

      <label for="why">Why are you interested in this role?</label>
      <textarea id="why" name="motivation" maxlength="600"></textarea>

      <label for="salary">Desired salary</label>
      <input id="salary" name="salary" />

      <label for="password">Password</label>
      <input id="password" type="password" />

      <label for="country">Location</label>
      <select id="country" name="country">
        <option value="">Choose</option>
        <option value="London">London</option>
      </select>
    </form>
  </main>
`;

describe("Magic Fill detector", () => {
  beforeEach(() => {
    document.body.innerHTML = fixture;
    document.title = "Application";
    Element.prototype.getBoundingClientRect = () =>
      ({
        x: 0,
        y: 0,
        width: 160,
        height: 28,
        top: 0,
        right: 160,
        bottom: 28,
        left: 0,
        toJSON: () => ({}),
      }) as DOMRect;
  });

  it("detects visible fillable fields and labels", () => {
    const fields = detectFields();
    expect(fields.map((f) => f.label)).toContain("First name");
    expect(fields.map((f) => f.label)).toContain("Why are you interested in this role?");
    expect(fields.find((f) => f.idAttr === "country")?.options).toEqual([
      { value: "", label: "Choose" },
      { value: "London", label: "London" },
    ]);
  });

  it("keeps each field context local to avoid cross-field sensitive matches", () => {
    document.body.innerHTML = `
      <main>
        <form>
          <label for="name">Full name</label>
          <input id="name" name="name" />
          <label for="visa">Will you require visa sponsorship?</label>
          <select id="visa" name="visa"><option>No</option></select>
        </form>
      </main>
    `;

    const fields = detectFields();
    const name = fields.find((f) => f.idAttr === "name");
    const visa = fields.find((f) => f.idAttr === "visa");

    expect(name?.context.toLowerCase()).not.toContain("visa");
    expect(name?.context.toLowerCase()).not.toContain("sponsorship");
    expect(visa?.context.toLowerCase()).toContain("sponsorship");
  });

  it("collapses Ashby-style radio and checkbox groups into logical fields", () => {
    document.body.innerHTML = `
      <main>
        <fieldset class="_container_1258i_28 _fieldEntry_1e3gg_28">
          <label class="ashby-application-form-question-title">What is your current age?</label>
          <div><label for="age-1">18-24</label><input id="age-1" type="radio" name="age-group" value="on" /></div>
          <div><label for="age-2">25-34</label><input id="age-2" type="radio" name="age-group" value="on" /></div>
          <div><label for="age-3">I prefer not to answer</label><input id="age-3" type="radio" name="age-group" value="on" /></div>
        </fieldset>
        <fieldset class="_container_1258i_28 _fieldEntry_1e3gg_28">
          <label class="ashby-application-form-question-title">Which tools have you used?</label>
          <div><label for="tool-1">Claude Code</label><input id="tool-1" type="checkbox" name="Claude Code" value="on" /></div>
          <div><label for="tool-2">Cursor</label><input id="tool-2" type="checkbox" name="Cursor" value="on" /></div>
        </fieldset>
      </main>
    `;

    const fields = detectFields();
    const age = fields.find((f) => f.label === "What is your current age?");
    const tools = fields.find((f) => f.label === "Which tools have you used?");

    expect(age?.options.map((option) => option.label)).toEqual(["18-24", "25-34", "I prefer not to answer"]);
    expect(tools?.multi).toBe(true);
    expect(tools?.options.map((option) => option.label)).toEqual(["Claude Code", "Cursor"]);
    expect(fields.filter((f) => f.inputType === "radio")).toHaveLength(1);
    expect(fields.filter((f) => f.inputType === "checkbox")).toHaveLength(1);
  });

  it("captures the field's instruction subtitle via aria-describedby", () => {
    document.body.innerHTML = `
      <main>
        <label for="langs">Other languages</label>
        <p id="langs-help">Please list any other languages you speak and their level using the CEFR scale (A1–C2). If none apply, please enter NA.</p>
        <textarea id="langs" aria-describedby="langs-help"></textarea>
      </main>
    `;

    const fields = detectFields();
    const langs = fields.find((f) => f.label === "Other languages");
    expect(langs).toBeTruthy();
    expect(langs?.context).toContain("CEFR");
    expect(langs?.context).toContain("enter NA");
  });

  it("detects custom (react-select style) comboboxes as combobox fields", () => {
    document.body.innerHTML = `
      <main>
        <label id="country-label">Country</label>
        <div class="select__control">
          <input role="combobox" aria-labelledby="country-label" aria-autocomplete="list" aria-expanded="false" />
        </div>
      </main>
    `;

    const fields = detectFields();
    const country = fields.find((f) => f.label === "Country");
    expect(country?.inputType).toBe("combobox");
    // The inner input must not also surface as a separate plain text field.
    expect(fields.filter((f) => f.label === "Country")).toHaveLength(1);
  });

  it("fills a custom combobox by opening it and clicking the matching option", async () => {
    document.body.innerHTML = `
      <main>
        <label id="c-label">Country</label>
        <div class="select__control">
          <input id="country-input" role="combobox" aria-labelledby="c-label" aria-autocomplete="list" />
        </div>
        <div role="listbox">
          <div role="option" data-value="GB">United Kingdom</div>
          <div role="option" data-value="US">United States</div>
        </div>
      </main>
    `;

    const fields = detectFields();
    const country = fields.find((f) => f.label === "Country");
    expect(country).toBeTruthy();

    let clicked = "";
    document.querySelectorAll("[role='option']").forEach((option) => {
      option.addEventListener("click", () => {
        clicked = option.textContent || "";
      });
    });

    const result = await applyFillPlan({
      answers: [{ fieldId: country!.id, value: "United Kingdom", confidence: 0.9, source: "test" }],
      skipped: [],
      warnings: [],
    });

    expect(result.filled).toBe(1);
    expect(clicked).toBe("United Kingdom");
  });

  it("collects a page snapshot for the backend", () => {
    const page = collectPage();
    expect(page.title).toBe("Application");
    expect(page.fields.length).toBeGreaterThan(3);
    expect(page.pageTextSummary).toContain("Product Manager application");
  });

  it("captures likely job description context separately from application fields", () => {
    document.title = "Senior Product Manager - ExampleCo Careers";
    document.body.innerHTML = `
      <main>
        <h1>Senior Product Manager</h1>
        <p class="location">London</p>
        <section class="job-description">
          <h2>About the role</h2>
          <p>${"You will lead product discovery, roadmap planning, and cross-functional delivery. ".repeat(14)}</p>
          <h2>Requirements</h2>
          <p>${"Experience with B2B products, analytics, stakeholder management, and shipping customer-facing software. ".repeat(10)}</p>
        </section>
        <a href="/jobs/123/application">Apply now</a>
      </main>
    `;

    const snapshot = collectJobContextSnapshot("job_page");

    expect(snapshot?.role).toBe("Senior Product Manager");
    expect(snapshot?.description).toContain("product discovery");
    expect(snapshot?.applyHints[0]?.href).toContain("/jobs/123/application");
    expect(snapshot?.confidence).toBeGreaterThan(0.45);
  });

  it("uses JobPosting JSON-LD when job boards provide structured metadata", () => {
    document.title = "Careers";
    document.body.innerHTML = `
      <main>
        <h1>Careers</h1>
        <script type="application/ld+json">
          {
            "@context": "https://schema.org",
            "@type": "JobPosting",
            "title": "Senior Data Analyst",
            "hiringOrganization": { "name": "Example Analytics" },
            "jobLocation": { "address": { "addressLocality": "London", "addressCountry": "UK" } },
            "description": "<p>About the role</p><p>${"You will build reporting, own metrics, and work with product teams. ".repeat(16)}</p><p>Requirements</p><p>${"Experience with SQL, analytics, stakeholder management, and experimentation. ".repeat(12)}</p>"
          }
        </script>
        <button>Apply now</button>
      </main>
    `;

    const snapshot = collectJobContextSnapshot("job_page");

    expect(snapshot?.role).toBe("Senior Data Analyst");
    expect(snapshot?.company).toBe("Example Analytics");
    expect(snapshot?.location).toContain("London");
    expect(snapshot?.description).toContain("build reporting");
    expect(snapshot?.confidence).toBeGreaterThan(0.45);
  });

  it("uses schema.org microdata job postings when JSON-LD is absent", () => {
    document.title = "Open roles";
    document.body.innerHTML = `
      <main itemscope itemtype="https://schema.org/JobPosting">
        <h1 itemprop="title">Platform Engineer</h1>
        <span itemprop="hiringOrganization">InfraWorks</span>
        <span itemprop="jobLocation">Remote UK</span>
        <section itemprop="description">
          <h2>The role</h2>
          <p>${"You will build developer platforms, improve CI/CD, and support production systems. ".repeat(14)}</p>
          <h2>Requirements</h2>
          <p>${"Experience with cloud infrastructure, TypeScript, observability, and secure delivery workflows. ".repeat(10)}</p>
        </section>
        <a href="/apply/platform-engineer">Apply now</a>
      </main>
    `;

    const snapshot = collectJobContextSnapshot("job_page");

    expect(snapshot?.role).toBe("Platform Engineer");
    expect(snapshot?.company).toBe("InfraWorks");
    expect(snapshot?.location).toBe("Remote UK");
    expect(snapshot?.description).toContain("developer platforms");
  });

  it("uses app hydration JSON when modern job boards store the posting in page data", () => {
    document.title = "Jobs";
    document.body.innerHTML = `
      <main><h1>Job details</h1><button>Apply now</button></main>
      <script id="__NEXT_DATA__" type="application/json">
        {
          "props": {
            "pageProps": {
              "job": {
                "title": "Lifecycle Marketing Manager",
                "company": { "name": "GrowthCo" },
                "locationName": "London",
                "jobDescription": "${"About the role. You will own lifecycle campaigns, customer segmentation, experimentation, and reporting. ".repeat(14)} ${"Requirements include CRM experience, analytics, stakeholder management, and excellent writing. ".repeat(10)}"
              }
            }
          }
        }
      </script>
    `;

    const snapshot = collectJobContextSnapshot("job_page");

    expect(snapshot?.role).toBe("Lifecycle Marketing Manager");
    expect(snapshot?.company).toBe("GrowthCo");
    expect(snapshot?.description).toContain("lifecycle campaigns");
  });

  it("applies fill plans without submitting the form", async () => {
    const fields = detectFields();
    const first = fields.find((f) => f.idAttr === "first")!;
    const why = fields.find((f) => f.idAttr === "why")!;
    const result = await applyFillPlan({
      answers: [
        { fieldId: first.id, value: "Gautam", confidence: 0.99, source: "test" },
        { fieldId: why.id, value: "This role fits my product background.", confidence: 0.9, source: "test" },
      ],
      skipped: [],
      warnings: [],
    });
    expect(result.filled).toBe(2);
    expect((document.querySelector("#first") as HTMLInputElement).value).toBe("Gautam");
    expect((document.querySelector("#why") as HTMLTextAreaElement).value).toContain("product background");
  });

  it("preserves values the user already entered", async () => {
    (document.querySelector("#first") as HTMLInputElement).value = "Manual name";
    const fields = detectFields();
    const first = fields.find((f) => f.idAttr === "first")!;
    const why = fields.find((f) => f.idAttr === "why")!;

    const result = await applyFillPlan({
      answers: [
        { fieldId: first.id, value: "AI name", confidence: 0.99, source: "test" },
        { fieldId: why.id, value: "AI motivation answer.", confidence: 0.9, source: "test" },
      ],
      skipped: [],
      warnings: [],
    });

    expect(result.filled).toBe(1);
    expect((document.querySelector("#first") as HTMLInputElement).value).toBe("Manual name");
    expect((document.querySelector("#why") as HTMLTextAreaElement).value).toBe("AI motivation answer.");
  });

  it("applies fuzzy select and radio options using native events", async () => {
    document.body.innerHTML = `
      <main>
        <form>
          <label for="gender">Gender</label>
          <select id="gender" name="gender">
            <option value="">Select</option>
            <option value="m">Man</option>
            <option value="w">Woman</option>
          </select>
          <fieldset>
            <legend>Do you require sponsorship?</legend>
            <label for="sponsor-yes">Yes</label>
            <input id="sponsor-yes" type="radio" name="sponsor" value="yes" />
            <label for="sponsor-no">No</label>
            <input id="sponsor-no" type="radio" name="sponsor" value="no" />
          </fieldset>
        </form>
      </main>
    `;
    const events: string[] = [];
    document.querySelector("#gender")?.addEventListener("change", () => events.push("select"));
    document.querySelector("#sponsor-no")?.addEventListener("change", () => events.push("radio"));

    const fields = detectFields();
    const gender = fields.find((f) => f.idAttr === "gender")!;
    const sponsorship = fields.find((f) => f.label === "Do you require sponsorship?")!;
    const result = await applyFillPlan({
      answers: [
        { fieldId: gender.id, value: "male", confidence: 0.9, source: "test" },
        { fieldId: sponsorship.id, value: "No", confidence: 0.9, source: "test" },
      ],
      skipped: [],
      warnings: [],
    });

    expect(result.filled).toBe(2);
    expect((document.querySelector("#gender") as HTMLSelectElement).value).toBe("m");
    expect((document.querySelector("#sponsor-no") as HTMLInputElement).checked).toBe(true);
    expect((document.querySelector("#sponsor-yes") as HTMLInputElement).checked).toBe(false);
    expect(events).toEqual(["select", "radio"]);
  });

  it("does not replace existing select or choice-group answers", async () => {
    document.body.innerHTML = `
      <main>
        <form>
          <label for="gender">Gender</label>
          <select id="gender" name="gender">
            <option value="">Select</option>
            <option value="m">Man</option>
            <option value="w">Woman</option>
          </select>
          <fieldset>
            <legend>Do you require sponsorship?</legend>
            <label for="sponsor-yes">Yes</label>
            <input id="sponsor-yes" type="radio" name="sponsor" value="yes" checked />
            <label for="sponsor-no">No</label>
            <input id="sponsor-no" type="radio" name="sponsor" value="no" />
          </fieldset>
        </form>
      </main>
    `;
    (document.querySelector("#gender") as HTMLSelectElement).value = "w";

    const fields = detectFields();
    const gender = fields.find((f) => f.idAttr === "gender")!;
    const sponsorship = fields.find((f) => f.label === "Do you require sponsorship?")!;
    const result = await applyFillPlan({
      answers: [
        { fieldId: gender.id, value: "male", confidence: 0.9, source: "test" },
        { fieldId: sponsorship.id, value: "No", confidence: 0.9, source: "test" },
      ],
      skipped: [],
      warnings: [],
    });

    expect(result.filled).toBe(0);
    expect((document.querySelector("#gender") as HTMLSelectElement).value).toBe("w");
    expect((document.querySelector("#sponsor-yes") as HTMLInputElement).checked).toBe(true);
    expect((document.querySelector("#sponsor-no") as HTMLInputElement).checked).toBe(false);
  });

  it("does not treat negative authorization answers as affirmative choices", async () => {
    document.body.innerHTML = `
      <main>
        <form>
          <fieldset>
            <legend>Are you legally authorized to work in the United Kingdom?</legend>
            <label for="auth-yes">Yes, I am authorized</label>
            <input id="auth-yes" type="radio" name="authorized" value="yes" />
            <label for="auth-no">No, I am not authorized</label>
            <input id="auth-no" type="radio" name="authorized" value="no" />
          </fieldset>
        </form>
      </main>
    `;

    const field = detectFields().find((f) => f.label === "Are you legally authorized to work in the United Kingdom?")!;
    const result = await applyFillPlan({
      answers: [{ fieldId: field.id, value: "not authorized", confidence: 0.95, source: "test" }],
      skipped: [],
      warnings: [],
    });

    expect(result.filled).toBe(1);
    expect((document.querySelector("#auth-no") as HTMLInputElement).checked).toBe(true);
    expect((document.querySelector("#auth-yes") as HTMLInputElement).checked).toBe(false);
  });

  it("clicks choice labels so controlled radio and checkbox components update", async () => {
    document.body.innerHTML = `
      <main>
        <form>
          <fieldset class="_fieldEntry_test">
            <label class="ashby-application-form-question-title">What is your gender identity?</label>
            <label for="gender-man">Man</label>
            <input id="gender-man" type="radio" name="gender" value="on" />
            <label for="gender-woman">Woman</label>
            <input id="gender-woman" type="radio" name="gender" value="on" />
          </fieldset>
          <fieldset class="_fieldEntry_test">
            <label class="ashby-application-form-question-title">Which of the following communities do you belong to?</label>
            <label for="community-none">None of the above</label>
            <input id="community-none" type="checkbox" name="None of the above" value="on" />
          </fieldset>
        </form>
      </main>
    `;

    const manLabel = document.querySelector<HTMLLabelElement>("label[for='gender-man']")!;
    const noneLabel = document.querySelector<HTMLLabelElement>("label[for='community-none']")!;
    const manClick = vi.spyOn(manLabel, "click");
    const noneClick = vi.spyOn(noneLabel, "click");

    const fields = detectFields();
    const gender = fields.find((f) => f.label === "What is your gender identity?")!;
    const communities = fields.find((f) => f.label === "Which of the following communities do you belong to?")!;
    const result = await applyFillPlan({
      answers: [
        { fieldId: gender.id, value: "Man", confidence: 0.96, source: "extension.field_memory" },
        { fieldId: communities.id, value: "None of the above", confidence: 0.96, source: "extension.field_memory" },
      ],
      skipped: [],
      warnings: [],
    });

    expect(result.filled).toBe(2);
    expect(manClick).toHaveBeenCalledTimes(1);
    expect(noneClick).toHaveBeenCalledTimes(1);
    expect((document.querySelector("#gender-man") as HTMLInputElement).checked).toBe(true);
    expect((document.querySelector("#community-none") as HTMLInputElement).checked).toBe(true);
  });

  it("detects and fills fields inside open shadow roots", async () => {
    document.body.innerHTML = `<main><job-application></job-application></main>`;
    const host = document.querySelector("job-application")!;
    const shadow = host.attachShadow({ mode: "open" });
    shadow.innerHTML = `
      <form>
        <label for="portfolio">Portfolio URL</label>
        <input id="portfolio" name="portfolio" />
        <fieldset>
          <legend>Gender</legend>
          <label for="gender-man">Man</label>
          <input id="gender-man" type="radio" name="gender" value="on" />
          <label for="gender-woman">Woman</label>
          <input id="gender-woman" type="radio" name="gender" value="on" />
        </fieldset>
      </form>
    `;

    const fields = detectFields();
    const portfolio = fields.find((field) => field.label === "Portfolio URL")!;
    const gender = fields.find((field) => field.label === "Gender")!;

    expect(portfolio).toBeTruthy();
    expect(gender.options.map((option) => option.label)).toEqual(["Man", "Woman"]);

    const result = await applyFillPlan({
      answers: [
        { fieldId: portfolio.id, value: "https://example.com", confidence: 0.99, source: "test" },
        { fieldId: gender.id, value: "male", confidence: 0.96, source: "test" },
      ],
      skipped: [],
      warnings: [],
    });

    expect(result.filled).toBe(2);
    expect((shadow.querySelector("#portfolio") as HTMLInputElement).value).toBe("https://example.com");
    expect((shadow.querySelector("#gender-man") as HTMLInputElement).checked).toBe(true);
  });

  it("captures styled radio groups when the input is hidden but the label is visible", async () => {
    document.body.innerHTML = `
      <main>
        <fieldset>
          <legend>What is your gender?</legend>
          <label for="styled-man">Man</label>
          <input id="styled-man" type="radio" name="styled-gender" value="on" style="display:none" />
          <label for="styled-woman">Woman</label>
          <input id="styled-woman" type="radio" name="styled-gender" value="on" style="display:none" />
        </fieldset>
      </main>
    `;

    const field = detectFields().find((item) => item.label === "What is your gender?")!;
    expect(field.options.map((option) => option.label)).toEqual(["Man", "Woman"]);

    const result = await applyFillPlan({
      answers: [{ fieldId: field.id, value: "Man", confidence: 0.96, source: "test" }],
      skipped: [],
      warnings: [],
    });

    expect(result.filled).toBe(1);
    expect((document.querySelector("#styled-man") as HTMLInputElement).checked).toBe(true);
  });

  it("finds BambooHR-style hidden resume uploads with nearby ancestor labels", () => {
    document.body.innerHTML = `
      <form>
        <div class="field-block">
          <p>Resume*</p>
          <div class="upload-row">
            <button type="button">Choose File*</button>
            <p>No file selected</p>
            <div>
              <input
                type="file"
                aria-label="file-input"
                accept=".pdf,.doc,.docx,.txt"
                tabindex="-1"
                required
                style="width:0;height:0"
              />
            </div>
          </div>
        </div>
      </form>
    `;

    const field = findResumeUploadField();

    expect(field.found).toBe(true);
    expect(field.label).toBeTruthy();
  });

});
