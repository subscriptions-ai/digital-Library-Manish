export async function evaluateArticlesWithAI(domain: string, articles: any[]): Promise<any[]> {
  const apiKey = process.env.OPENROUTER_API_KEY || "";
  const model = "nvidia/nemotron-3-super-120b-a12b:free";

  if (articles.length === 0) return [];

  // Prepare a concise payload to avoid token limits
  const promptData = articles.map((a, idx) => ({
    id: idx,
    title: a.title,
    abstract: a.abstract ? a.abstract.substring(0, 300) + '...' : 'No abstract'
  }));

  const systemPrompt = `You are an expert academic librarian and data curator.
Your task is to filter a list of articles and return ONLY the ones that are strictly relevant to the domain: "${domain}".
The articles must be high-quality, academic, and contextually appropriate.
Ignore articles that are completely off-topic or generic low-quality entries.
Return a valid JSON array containing ONLY the IDs of the approved articles. Example: [0, 2, 5]. Do not return any other text.`;

  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: JSON.stringify(promptData) }
        ],
        response_format: { type: "json_object" }
      })
    });

    if (!res.ok) {
      console.error("OpenRouter API Error:", await res.text());
      return articles; // fallback to returning all if AI fails
    }

    const data = await res.json();
    const content = data.choices[0]?.message?.content || "[]";
    
    // Extract the JSON array from the content using regex
    let approvedIds: number[] = [];
    const match = content.match(/\[([\d,\s]*)\]/);
    if (match) {
      approvedIds = match[1].split(',')
        .map(s => parseInt(s.trim(), 10))
        .filter(n => !isNaN(n));
    }

    const filtered = articles.filter((_, idx) => approvedIds.includes(idx));
    console.log(`AI Agent filtered ${articles.length} down to ${filtered.length} high-quality articles.`);
    return filtered.length > 0 ? filtered : articles.slice(0, 2); // always return at least a couple fallback
  } catch (err) {
    console.error("AI Evaluation failed:", err);
    return articles;
  }
}
