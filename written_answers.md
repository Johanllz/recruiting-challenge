# Written answers — Juan Lopez Lopez

## Authorship declaration

I wrote these answers entirely without AI assistance.
---

## Q1 — Production correctness validation

> Describe a system you owned where you had to add production correctness validation — alarms, contract tests, golden datasets, something that caught a class of bugs before users did. What did you do, what worked, what didn't, and what would you do differently?

I haven't owned a production system yet, with this kind of validation. But I worked in a security system to detect demographic varaibles in audio. The system is a 911 emegency call agent, the system gets the audio call from Twilio, gets transcript and it's returned to ElevenLabs. My job was to find a way to make this system able to detect chracteristics such as gender of the person calling, age, and emotional state. I proposed a second layer or parallel channel; after the call is sent by twilio, then the audio get's sent to the orignal channel (ElevenLabs), and in parallel the audio is also sent to the second channed, trought FastApi its converted to audio signal, and it gets processed by local models or API models (Gemini for example). After the models process the signal, the output is stored in a JSON file and sent to first channel(ElevenLabs). The agent now has the context of the person calling, Also the operator (a real person monitoring the call) is also in control and can see the JSON output with the demographic characteristics. The system worked partially, it was more a prototype that needed some fixes to be launched in production. One gap was the orignal system, when working with twilio and Elevenalbs sometimes there would be connection issues (long latency between the call or the answer from Elevenlabs), one approach would be to use another service instead of Twilio or even build a local service. In the case of ElevenLabs the problem was different, the agent was powered by Claude sonnet 4.6, the problem was that it'll get so much context that ill start to allucinate or give wrong information. One approach would be to reduce the master prompt or instruction prompt to something more compact. 



## Q2 — Scaling-forced structural change

> Describe a system you've worked on where scaling — traffic, data volume, team size, or geography — forced a structural change to the code or architecture. What changed, who pushed back, and how did you decide?

When i was working in an academic project using ROS (to manipulate a robot), Gazebo and Raspberry, at first the team divided, two members would work in the raspberry part, two other members would work in the simulation with gazebo, and two others would work in the logic and code. When we tried to put it all together everyting started to break apart, nothing worked and we found many deprecated libraries, specifically with ROS and Raspberry, (the robot was old, so that was an issue), what I proposed was to create a unique enviroment that would work, and we all can use, So I suggested using Docker; The main focus now was to find the right libraries, and test it worked. thanks to my team the right or best libraries were found, and we reach a 100% compatibility with the raspberry chip, It was a workflow change and intern strcutrure too, in long term the firs workflow wouldn't work because any member of the team would eventually fins inccompatibilities, so the docker decision was the best approach. At first some of the team did't wanted to change the workflow because the progress they did at the moment was already advanced, but they understood it was the best approach so we all could work in the same enviroment.



## Q3 — A time you rejected AI output (or accepted bad output and changed your process)

> Describe a specific moment in real work where you rejected AI output that you initially thought was correct, **or** accepted AI output that turned out to be wrong. Be concrete: what was the task, what was the output, what was the signal that flipped your judgment, and what did you do next? If the answer is "I accepted it and it shipped a bug," what did you change about your process so the class of mistake doesn't recur?

When working on this dashboard, specifically when I asked Claude (Opus)  to test the project and evaluate it, at first I trusted his output because honstly claude is one of the best models out there, And my lack of experince in web develpment also blinded my decision. Claude ran the test and detected some bugs and issues in the project. I read them all and tried to undersand, I thought he was correct. But based on my experiencie with LLM models and working on other projects, part of my workflow is not not stick with just one answer or just one opinion from anybody or anything, in this case AI's, so usually ask the same task to other models like chatpgt, gemini, DeepSeek etc. in this case what I found was that the output of gemini and claude was similar, but some things were different. Then I asked for a second opinion from other model from Anthropic (Sonnet) and corrected my guess, both models described the date filter, but differently.  So then I asked claude (Opus) again about this discrepancy, ran more test and confirmed that he was wrong and Gemini was rigt. So I do that with diferent parts of the project i'm workin on, i usually have 2 or 3 or even more diffent models to test the oputs of each other, bascially having different opinions or approaches.  



