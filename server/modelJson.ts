// Accepts plain JSON, JSON in a ``` fence, or JSON with stray text around it.
// Returns undefined (never a made-up default) when nothing parses.
export function parseModelJson(text: string): any {
  const attempts = [text, text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')];
  const cleaned = attempts[1];
  const o1 = cleaned.indexOf('{');
  const o2 = cleaned.lastIndexOf('}');
  if (o1 !== -1 && o2 > o1) attempts.push(cleaned.slice(o1, o2 + 1));
  for (const a of attempts) {
    try {
      return JSON.parse(a);
    } catch {}
  }
  return undefined;
}
