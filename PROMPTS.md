Far too many chats to include but the root prompt for the most part is the one pasted below. I used gitingest and this repo so I could update it on the code.


"I am making a project about an AI autobiography writer, where basically you input details about your life and it is a really good interviewer. I need it to be coded all using Cloudflare tech.

Basically the interface should start out by asking your name and date of birth, then asking you to select on a map where u were born and then u can add dates and new locations for where and when u moved. It then allows you to submit documents such as your resume, basically 10 PDFs.

So now we can have the AI have two environments/documents to play with. One is the plan/outline/table of contents for the user autobiography. The second is the actual book itself. I'm thinking we use Gemini for the LLM instead because its a 1M token context window and the book might get long.

So once it has the outline, it will start interviewing you about the first chapter. The interviewer is not separate from the writer. It writes stuff AS it interviews you. Then it asks you questions/clarifications, just like genuinely curious and engaged about the period of time/topic that outline part covers.

Then finally at some point it should wrap up and you or the AI sees that ok, I don't have much more to write about for this phase of my life. Let's talk about the next chapter. The AI can then opt to iterate on the outline/plan based on the chat history (interview)/draft of the previous phase. Obviously it can't iterate on the outline part it has already done, but I mean future ones. So of course we need to clarify that in the context like what parts are iteratable. And then if it decides the plan is good, then we start the interview/writing process for the next chapter, and this builds upon the book itself. The AI cannot go back and edit previous chapters, so the chapter it writes is blank but just gets appended to the first chapter. We need to develop a good writing interface where even the user can type in it, sort of like ChatGPT canvas writing I suppose.

Eventually it should reach the end. You can read over your autobiography in a nice interface and ask for adjustments. After that, you can export it as a PDF.

All the documents, context engineering, etc has to be done locally. No sign in no nothing.

I'm doing this using ONLY cloudflare tech, for the AI deployment, workflow, everything. It's all Cloudflare tech because I am submitting it for my internship application.

Stuff from Cloudflare:

LLM -I'm using gemini 3 flash
Workflow / coordination (recommend using Workflows, Workers or Durable Objects)
User input via chat or voice (recommend using Pages or Realtime)
Memory or state
Find additional documentation here.

IMPORTANT NOTE:
To be considered, your repository name must be prefixed with cf_ai_, must include a README.md file with project documentation and clear running instructions to try out components (either locally or via deployed link). AI-assisted coding is encouraged, but you must include AI prompts used in PROMPTS.md

All work must be original; copying from other submissions is strictly prohibited.
https://developers.cloudflare.com/agents/
https://agents.cloudflare.com/"
