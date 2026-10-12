// Loaded into the switch test's server only: points the Gemini client at the test's counting stand-in, so no test can reach
// the real model and every model call is counted.
import { setDefaultBaseUrls } from '@google/genai';
setDefaultBaseUrls({ geminiUrl: process.env.MOCK_GEMINI_URL });
