import type { Browser } from "playwright";

let browserPromise: Promise<Browser> | null = null;

async function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    browserPromise = import("playwright").then(({ chromium }) =>
      chromium.launch({
        headless: true,
        args: ["--no-sandbox", "--disable-setuid-sandbox"],
      }),
    );
  }
  return browserPromise;
}

export async function renderHtmlToPdf(
  html: string,
  options: { format?: "A4" | "Letter"; timeoutMs?: number } = {},
): Promise<Uint8Array> {
  const browser = await getBrowser();
  const page = await browser.newPage({
    viewport: options.format === "Letter" ? { width: 816, height: 1056 } : { width: 794, height: 1123 },
    deviceScaleFactor: 1,
  });

  try {
    page.setDefaultTimeout(options.timeoutMs ?? 30_000);
    await page.emulateMedia({ media: "print" });
    await page.setContent(html, { waitUntil: "load" });
    await page.evaluate(() =>
      Promise.race([
        document.fonts?.ready.then(() => true) ?? Promise.resolve(true),
        new Promise((resolve) => window.setTimeout(resolve, 2500)),
      ]),
    );
    const pdf = await page.pdf({
      format: options.format ?? "A4",
      printBackground: true,
      preferCSSPageSize: true,
    });
    return new Uint8Array(pdf);
  } finally {
    await page.close().catch(() => undefined);
  }
}
