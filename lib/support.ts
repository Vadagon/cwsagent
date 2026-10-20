// Reads the User support table: each issue's row, then its details by
// expanding the row (clicking its first cell, as a user would) and collapsing
// it again. It never touches the reply box, "Publish reply" or the status menu.
import { clean, main, sleep, waitFor } from './dashboard';
import type { RunContext } from './types';

export interface SupportReply { date: string; author: string; text: string }
export interface SupportIssue {
  date: string;
  type: string;
  subject: string;
  from: string;
  status: string;
  message: string;
  itemVersion?: string;
  clientVersion?: string;
  replies: SupportReply[];
}

const cells = (tr: Element) => [...tr.querySelectorAll(':scope > td')].map((td) => clean((td as HTMLElement).innerText.split('\n')[0]));
const bodyRows = () => [...main().querySelectorAll('tbody tr, tr')].filter((tr) => tr.querySelector(':scope > td'));

/** Issue rows have a date, a type, a subject, a sender and a status. */
function issueRows(): HTMLTableRowElement[] {
  return bodyRows().filter((tr) => {
    const c = cells(tr);
    return c.length >= 5 && /\d{4}/.test(c[0] ?? '') && c[1] !== 'Reply';
  }) as HTMLTableRowElement[];
}

function readDetails(rows: HTMLTableRowElement[], issue: SupportIssue) {
  for (const tr of rows) {
    const c = cells(tr);
    if (c[1] === 'Reply') {
      issue.replies.push({ date: c[0] ?? '', text: c[2] ?? '', author: c[3] ?? '' });
      continue;
    }
    const text = (tr as HTMLElement).innerText;
    const body = text.split(/\n\s*Your response\s*\n/)[0] ?? '';
    if (!issue.message) issue.message = body.replace(/^[\t\s]+/, '').trim();
    issue.itemVersion ??= text.match(/Item version:\s*([^\n]+)/)?.[1]?.trim();
    issue.clientVersion ??= text.match(/Client Version:\s*([^\n]+)/)?.[1]?.trim();
  }
}

/** Clicks the first cell of an issue row to toggle its details. */
async function toggle(row: HTMLTableRowElement) {
  (row.querySelector(':scope > td') as HTMLElement | null)?.click();
  await sleep(700);
}

function nextPageButton(): HTMLButtonElement | null {
  return [...main().querySelectorAll<HTMLButtonElement>('button')]
    .find((b) => /navigate_next|next page/i.test(`${b.innerText} ${b.getAttribute('aria-label') ?? ''}`)) ?? null;
}

export async function readSupport(ctx: RunContext): Promise<SupportIssue[]> {
  await waitFor(() => issueRows().length || /No issues found/i.test(main().innerText), { timeout: 15000 });
  const issues: SupportIssue[] = [];
  for (let page = 0; page < 100; page++) {
    const rows = issueRows();
    for (const [i, row] of rows.entries()) {
      ctx.check();
      ctx.progress(`Reading support issue ${issues.length + 1}`);
      const c = cells(row);
      const issue: SupportIssue = {
        date: c[0] ?? '', type: c[1] ?? '', subject: c[2] ?? '', from: c[3] ?? '', status: c[4] ?? '', message: '', replies: [],
      };
      const before = new Set(bodyRows());
      await toggle(row);
      // Detail and reply rows appear right after the issue row, up to the next issue.
      const after = bodyRows();
      const start = after.indexOf(row);
      const next = rows[i + 1];
      const end = next ? after.indexOf(next) : after.length;
      const details = after.slice(start + 1, end < 0 ? after.length : end).filter((tr) => !before.has(tr) || cells(tr)[1] === 'Reply');
      readDetails(details as HTMLTableRowElement[], issue);
      if (bodyRows().length > before.size) await toggle(row); // collapse again
      issues.push(issue);
    }
    const nextBtn = nextPageButton();
    if (!nextBtn || nextBtn.disabled || nextBtn.getAttribute('aria-disabled') === 'true') break;
    const firstBefore = issueRows()[0];
    nextBtn.click();
    if (!(await waitFor(() => issueRows()[0] !== firstBefore, { timeout: 8000 }))) break;
  }
  return issues;
}
