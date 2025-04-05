import puppeteer from "puppeteer";

const consoleLogs: string[] = [];

declare global {
  interface Window {
    mcpHelper: {
      logs: string[],
      originalConsole: Partial<typeof console>,
    }
    parseMermaidToExcalidraw: (mermaid: string) => Promise<{ elements: object[]; files: any[] }>;
    convertToExcalidrawElements: (elements: object[]) => object[];
  }
}

const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox", "--single-process", "--no-zygote"] });
const pages = await browser.pages();
const page = pages[0];

page.on("console", (msg) => {
  const logEntry = `[${msg.type()}] ${msg.text()}`;
  consoleLogs.push(logEntry);
});

const element = await page.addScriptTag({
  content: `
    import * as excalidrawmermaidToExcalidraw from 'https://esm.run/@excalidraw/mermaid-to-excalidraw';
    import * as excalidrawexcalidraw from 'https://esm.run/@excalidraw/excalidraw';
    window.parseMermaidToExcalidraw = excalidrawmermaidToExcalidraw.parseMermaidToExcalidraw;
    window.convertToExcalidrawElements = excalidrawexcalidraw.convertToExcalidrawElements;
  `,
  type: 'module'
});
try {
  await page.waitForFunction(() => typeof window.parseMermaidToExcalidraw === 'function', { timeout: 120_000 });
} catch (error) {
  throw new Error(`Timeout waiting for parseMermaidToExcalidraw to be available: ${(error as Error).message}`);
}

const parseMermaid = async (mermaid: string) => {
  await page.evaluate(() => {
    window.mcpHelper = {
      logs: [],
      originalConsole: { ...console },
    };

    ['log', 'info', 'warn', 'error'].forEach(method => {
      (console as any)[method] = (...args: any[]) => {
        window.mcpHelper.logs.push(`[${method}] ${args.join(' ')}`);
        (window.mcpHelper.originalConsole as any)[method](...args);
      };
    });
  });

  const { elements } = await page.evaluate(async (mermaid: string) => {
    const { elements, files } = await window.parseMermaidToExcalidraw(mermaid);
    return { elements: window.convertToExcalidrawElements(elements) };
  }, mermaid) as { elements: unknown[] };

  const logs = await page.evaluate(() => {
    Object.assign(console, window.mcpHelper.originalConsole);
    const logs = window.mcpHelper.logs;
    delete (window as any).mcpHelper;
    return logs;
  });

  return { elements, logs };
}

export { parseMermaid };
