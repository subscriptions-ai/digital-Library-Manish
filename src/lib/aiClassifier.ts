import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';

dotenv.config();

// Initialize the Google Gen AI SDK
// The SDK automatically picks up process.env.GEMINI_API_KEY
const ai = new GoogleGenAI({});

export interface RawMetadata {
  title?: string;
  authors?: string;
  description?: string;
  keywords?: string[];
  url?: string;
}

export interface ClassificationResult {
  title: string;
  authors: string;
  description: string;
  domain: string;
  contentType: string;
  subjectArea: string;
  tags: string[];
  confidence: number;
}

const DOMAINS = [
  "Electrical Engineering", "Computer/IT", "Medical Sciences", "Management", 
  "Chemistry", "Mechanical Engineering", "Pharmacy", "Civil/Construction", 
  "Nano Technology", "Bio Technology", "Energy", "Life Sciences", "Law", 
  "Agriculture", "Nursing", "Education & Social Sciences", "Applied Sciences", 
  "Multidisciplinary", "Electronics & Telecom", "Chemical Engineering", 
  "Ayurveda", "Architecture", "Material Science", "Applied Mechanics", "Social Sciences"
];

const CONTENT_TYPES = [
  "Books", "Periodicals", "Magazines", "Case Reports", "Theses", 
  "Conference Proceedings", "Educational Videos", "Newsletters"
];

export async function classifyContent(raw: RawMetadata): Promise<ClassificationResult> {
  const prompt = `
You are an expert academic content classifier for a digital library. 
You must analyze the following raw metadata and extract/standardize the fields.

Raw Metadata:
- Title: ${raw.title || "N/A"}
- Authors: ${raw.authors || "N/A"}
- Description: ${raw.description || "N/A"}
- Keywords: ${raw.keywords ? raw.keywords.join(", ") : "N/A"}
- Source URL: ${raw.url || "N/A"}

Instructions:
1. "title": Clean up the title (remove junk, fix casing, remove publisher info).
2. "authors": Normalize as "FirstName LastName, FirstName LastName".
3. "description": Write a concise, professional abstract (max 300 words). Use the raw description if it's good, otherwise generate a summary.
4. "domain": Choose EXACTLY ONE domain from this list: ${DOMAINS.join(', ')}. Do not invent new domains.
5. "contentType": Choose EXACTLY ONE content type from this list: ${CONTENT_TYPES.join(', ')}. Do not invent new types.
6. "subjectArea": Identify a specific academic sub-discipline (e.g., "Cardiovascular medicine", "Machine Learning").
7. "tags": Extract 5-10 highly relevant academic keywords as an array of strings.
8. "confidence": A float from 0.0 to 1.0 indicating how confident you are in this classification.

Return ONLY a valid JSON object matching this structure without any markdown formatting or backticks:
{
  "title": string,
  "authors": string,
  "description": string,
  "domain": string,
  "contentType": string,
  "subjectArea": string,
  "tags": string[],
  "confidence": number
}
`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        temperature: 0.2,
        responseMimeType: "application/json",
      }
    });

    const text = response.text || "";
    // Clean up potential markdown formatting if the model disobeys responseMimeType
    const jsonStr = text.replace(/```json\n/g, '').replace(/```/g, '').trim();
    
    const result = JSON.parse(jsonStr) as ClassificationResult;
    
    // Ensure lists are respected
    if (!DOMAINS.includes(result.domain)) result.domain = "Multidisciplinary";
    if (!CONTENT_TYPES.includes(result.contentType)) result.contentType = "Periodicals";
    
    return result;
  } catch (error) {
    console.error("AI Classification Error:", error);
    throw new Error("Failed to classify content with AI");
  }
}
